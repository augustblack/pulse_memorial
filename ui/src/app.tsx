import { createSignal, Show, createEffect, onCleanup } from 'solid-js'
import { requestFs, setOnFsChange, rmOnFsChange, isFsEnabled } from './utils'
import { createReconnectingWS } from "@solid-primitives/websocket"
import NoSleep from 'nosleep.js'


function logLocal(msg: any) {
  console.log(msg)
  // var logdiv = document.getElementById('log')
  // logdiv.innerHTML += `<div>${msg}</div>`
}
const getWsUrl = () => {
  var url = new URL(import.meta.env.VITE_WS_URL || String(window.location))
  url.protocol = url.protocol === 'https:' ? 'wss' : 'ws'
  url.pathname = ''
  console.log('websocket url', url.href)
  return url.href
}

type PlayState = 'loading' | 'ready' | 'playing' | 'disconnected'
function App() {
  const [playState, setPlayState] = createSignal<PlayState>('loading')
  const noSleep = new NoSleep()
  // @ts-ignore
  const opaqueId = 'pulse-' + Janus.randomString(12)
  const ws = createReconnectingWS(getWsUrl() + `ws/8/${opaqueId}`)
  let playButton!: HTMLButtonElement
  let centerDiv!: HTMLDivElement
  let audioEl!: HTMLAudioElement

  const onResize = () => {
    const size = window.innerHeight > window.innerWidth
      ? window.innerWidth * 0.75
      : window.innerHeight * 0.6
    centerDiv.style.width = size + "px"
    centerDiv.style.height = size + "px"
    playButton.style.fontSize = size / 5 + "px"
  }

  createEffect(() => onResize())
  window.addEventListener("resize", onResize)
  const onfullChange = () => {
    if (isFsEnabled()) {
      // setFs(true)
    } else {
      // setFs(false)
      noSleep.disable()
    }
  }
  // onfullChange()
  setOnFsChange(onfullChange)

  onCleanup(() => {
    window.removeEventListener("resize", onResize)
    rmOnFsChange(onfullChange)
  })

  ws.addEventListener("message", ({ data }) => {
    try {
      var msg = JSON.parse(data)
      console.log('msg', msg)
      if ('streamId' in msg) {
        logLocal('streamId:' + msg.streamId)
        // @ts-ignore
        init(msg.streamId, opaqueId, audioEl, setPlayState)
      }
      if ('participantCount' in msg) {
        logLocal('participantCount:' + msg.participantCount)
      }
    } catch (error) {
      console.log('msg decode error:', error)
    }
  })
  const setFullScreen = () => {
    noSleep.enable()
    // setFs(true)
    requestFs()
  }

  const playAudio = () => {
    console.log('audio play clicked')
    if (audioEl && audioEl.readyState >= 3 && audioEl.paused === true) {
      audioEl.play()
        .then(() => {
          if (playButton) {
            setPlayState('playing')
            setFullScreen()
          }
        })
        .catch(console.error)
    }
  }

  return (
    <div class="w-screen h-screen bg-red-200 flex justify-center items-center" >
      <audio ref={audioEl} style="hidden"></audio>
      <div ref={centerDiv} class="relative">
        <Show when={playState() === 'playing'}>
          <button class="absolute left-0 top-0 bg-red-600 animate-ping [animation-duration:_4s] rounded-full w-full h-full z-0 scale-70" />
        </Show>
        <button
          ref={playButton}
          class="absolute left-0 top-0 bg-red-600 text-red-900 p-4 rounded-full w-full h-full z-10 cursor-pointer"
          onClick={playAudio}>
          {
            playState() === 'playing'
              ? ''
              : playState() === 'ready'
                ? 'play'
                : playState()
          }
        </button>
      </div>
    </div>
  )
}

export default App
