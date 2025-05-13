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
  let dialogRef!: HTMLDialogElement

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
  const clickCloseModal = () => dialogRef.close()

  const openModal = () => dialogRef.showModal()

  return (
    <div class="w-screen h-screen flex justify-center items-center relative" >
      <audio ref={audioEl} style="hidden"></audio>
      <dialog ref={dialogRef} class="modal" open onClose={playAudio}>
        <div class="modal-box bg-base-200 p-0 w-3/4 max-w-5xl">
          <div class="flex flex-row-reverse gap-1 w-full">
            <button class="btn btn-sm btn-circle btn-ghost right-0 top-0" onClick={clickCloseModal}>✕</button>
          </div >
          <div class="flex flex-col gap-4 w-full h-2/3 overflow-y-auto p-4 xl:p-6 pt-0">
            <div><b>Pulse Memorial</b> is a living queer cyber memorial honoring the 49 lives lost in the 2016 Pulse nightclub shooting in Orlando.</div>

            <div>This memorial features a 24/7 web broadcast of 8 inidividual audio channels. Each listener receives one channel on their mobile device, creating a shared, moving multi-channel acoustic environment.</div>

            <div>For the full experience, listen together with seven or more participants in the same setting.</div>

            <div>Pulse Memorial is a project by artists <a href="https://brookportfolio.com/" class="font-semibold" target="_blank">brook vann</a>, <a href="https://www.betseybiggs.org/" class="font-semibold" target="_blank">betsey biggs</a>, and <a href="https://august.black/" class="font-semibold" target="_blank">august black</a>. We are currently expanding the composition as an open system to include queer voice recordings across 49 channels.
            </div>
            <div>Thank you for listening and taking time to remember.</div>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog >


      <div ref={centerDiv} class="relative">
        <Show when={playState() === 'playing'}>
          <button class="absolute left-0 top-0 bg-primary animate-ping [animation-duration:_4s] rounded-full w-full h-full z-0 scale-70" />
        </Show>
        <button
          ref={playButton}
          class="absolute left-0 top-0 bg-primary text-base-content p-4 rounded-full w-full h-full z-10 cursor-pointer"
          onClick={playAudio}>
          {
            playState() === 'playing'
              ? ''
              : playState() === 'ready'
                ? 'play'
                : playState()
          }
        </button>
      </div >
      <button class="absolute bottom-2 left-2 w-12 h-12 btn btn-ghost p-0" onClick={openModal}>
        <svg id="infosvg" xmlns="http://www.w3.org/2000/svg" class="w-full h-full" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor">
          <path d="M0 0h24v24H0V0z" fill="none"></path>
          <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path>
        </svg>
      </button>

    </div >
  )
}

export default App
