import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { basicAuth } from 'hono/basic-auth'
import { handleUpload } from './upload'
export { PulseServer } from './pulseserver'

type Bindings = {
  PULSE_SERVER: DurableObjectNamespace
  ELEVEN_API: string
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

app.use('/tts',
  cors({ origin: "http://localhost:5173", credentials: true }),
  basicAuth({ username: 'admin', password: 'pulse', })
)

app.post('/tts', async (c) => {
  try {
    const { text, voice_id } = await c.req.json()
    console.error('Received text for TTS:', text)
    console.error('Voice ID:', voice_id)

    const body = {
      text,
      voice_id,
      output_format: "mp3_44100_128",
      model_id: "eleven_multilingual_v2"
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        "Accept": "audio/mpeg",
        'Content-Type': 'application/json',
        'xi-api-key': c.env.ELEVEN_API
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error('ElevenLabs API error:', response.status, response.statusText, response)

      return response.status === 401
        ? c.json({ success: false, error: "Not enough credits to process this request. Please wait a few days." }, 502)
        : c.json({ success: false, error: "Unknown api error: " + response.statusText }, 502)
    }

    // Stream the audio response back to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline; filename="tts-audio.mp3"',
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Credentials': 'true'
      }
    })
  } catch (error) {
    console.error('Error processing TTS request:', error)
    return c.json({ success: false, error: 'Internal server error' }, 500)
  }
})

app.use('*', (c) => {
  const id = c.env.PULSE_SERVER.idFromName('A')
  const obj = c.env.PULSE_SERVER.get(id)
  return obj.fetch(c.req.url, c.req.raw)
})

export default app
