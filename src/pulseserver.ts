import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'

type PulseList = Map<number, Array<string>>

const createDefPL = (count: number, pl: PulseList): PulseList => {
  for (let i = 1; i <= count; i++) {
    if (!pl.get(i)) {
      { pl.set(i, []) }
    }
  }
  return pl
}

export class PulseServer {
  state: DurableObjectState
  app: Hono = new Hono()

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    const id = (this.state.getTags(ws) || ['wtf'])[0]

    const pulseList = await this.state.storage?.get<PulseList>('pulseList') || new Map()

    pulseList.forEach((v, key) => {
      pulseList.set(key, v.filter((i: string) => i !== id))
    })
    await this.state.storage?.put('pulseList', new Map(pulseList))
    // console.log('pl', pulseList)
    const participantCount = this.state.getWebSockets().length
    this.state.getWebSockets().forEach(w => w !== ws
      ? w.send(JSON.stringify({ participantCount }))
      : null
    )
  }

  async webSocketError(_ws: WebSocket, error: unknown) {
    console.log('got error:', error)
  }

  constructor(state: DurableObjectState) {
    this.state = state

    this.app.get('/pulselist/:count/next', async (c) => {
      const count = parseInt(c.req.param('count'))
      if (isNaN(count)) { return c.json({ error: 'count is not a number' }) }

      const pl = await this.state.storage?.get<PulseList>('pulseList') || new Map()
      const pulseList = createDefPL(count, pl)

      await this.state.storage?.put('pulseList', pulseList)

      return c.json({ pulseList })
    })

    this.app.use(
      '/ws/clear',
      basicAuth({
        username: 'admin',
        password: 'pulse',
      })
    )

    this.app.post('/ws/clear', async (c) => {
      await this.state.storage?.put('pulseList', new Map())
      return c.json(JSON.stringify({ done: true }))
    })

    this.app.get('/ws/:count/:id', async (c) => {
      const upgradeHeader = c.req.header('Upgrade')
      const count = parseInt(c.req.param('count'))
      const id = c.req.param('id')
      if (isNaN(count)) { return c.json(JSON.stringify({ error: 'count is not a number' }), 400) }

      if (upgradeHeader !== 'websocket') {
        console.log('NO upgrade HEADER', upgradeHeader)
        return c.json(JSON.stringify({ error: 'Expected websocket' }), 400)
      }

      const pl = await this.state.storage?.get<PulseList>('pulseList') || new Map()
      const pulseList = createDefPL(count, pl)
      // console.log('pl', pulseList)
      let min = { key: 1 + Math.floor(Math.random() * (count - 1)), len: 100000 }
      pulseList.forEach((v, key) => {
        if (v.length <= min.len) {
          min = { key, len: v.length }
        }
      })
      pulseList.set(min.key,
        (pulseList.get(min.key) || []).concat(id)
      )
      await this.state.storage?.put('pulseList', new Map(pulseList))

      const [client, server] = Object.values(new WebSocketPair())
      this.state.acceptWebSocket(server, [id])

      const participantCount = this.state.getWebSockets().length

      server.send(JSON.stringify({ streamId: min.key, participantCount }))
      this.state.getWebSockets().forEach(ws => ws !== server
        ? ws.send(JSON.stringify({ participantCount }))
        : null
      )

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    })

  }
  async fetch(request: Request) {
    return this.app.fetch(request)
  }
}
