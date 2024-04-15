import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
export { PulseServer } from './pulseserver'

type Bindings = {
  PULSE_SERVER: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', serveStatic({ root: './' }))
app.use('*', (c) => {
  const id = c.env.PULSE_SERVER.idFromName('A')
  const obj = c.env.PULSE_SERVER.get(id)
  return obj.fetch(c.req.url, c.req)
})

export default app
