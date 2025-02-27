import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { basicAuth } from 'hono/basic-auth'
import { handleUpload } from './upload'
export { PulseServer } from './pulseserver'

type Bindings = {
  PULSE_SERVER: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// static server is set in wrangler
// https://hono.dev/docs/getting-started/cloudflare-workers#serve-static-files
//
app.use('/files',
  cors({
    origin: "http://localhost:5173",
    credentials: true
  }),
  basicAuth({
    username: 'admin',
    password: 'pulse',
  }))
app.use('/files',
  /*
  basicAuth({
  username: 'admin',
  password: 'pulse',
}),*/
  handleUpload)

app.use('*', (c) => {
  const id = c.env.PULSE_SERVER.idFromName('A')
  const obj = c.env.PULSE_SERVER.get(id)
  return obj.fetch(c.req.url, c.req.raw)
})

export default app
