/* @refresh reload */
import { render } from 'solid-js/web'
import { For, Switch, Match, createSignal, onMount } from 'solid-js'
import { Component } from 'solid-js'
import { createDropzone, createFileUploader, fileUploader } from "@solid-primitives/upload"
import { useUploadContext, UploadProvider, SetUploadStore, UpItem } from './uploadContext'
import NoSleep from 'nosleep.js'
import jsSHA from 'jssha'

import './index.css'

fileUploader;
const noSleep = new NoSleep()

//VITE_WS_URL='http://localhost:8787'
const WORKERS_URL = import.meta.env.VITE_WS_URL || (window.location.protocol + '//' + window.location.hostname)
const FILES_ENDPOINT = (WORKERS_URL + '/files').replace(/([^:]\/)\/+/g, "$1")
console.log('WORKERS_URL', WORKERS_URL)
console.log('FILES_ENDPOINT', FILES_ENDPOINT)

const padit = (n: number) => String(n).padStart(2, '0')
const floorPad = (n: number) => padit(Math.floor(n))

const formatTime = (pos?: number, subsec = false): string => pos === null || pos === undefined
  ? ''
  : isFinite(pos)

    ? pos > 60 * 60
      ? Math.floor(pos / (60 * 60)) + ':' + floorPad((pos / 60) % 60) + ':' + floorPad(pos % 60)
      : pos > 1
        ? Math.floor((pos / 60) % 60) + ':' + floorPad(pos % 60)
        : subsec ? pos.toPrecision(2) + ' sec' : '0:00'
    : 'live'




export async function calcDigest(file: File | Blob) {
  const reader = file.stream().getReader()
  const shaObj = new jsSHA("SHA-256", "ARRAYBUFFER")

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    shaObj.update(value)
  }

  console.log(shaObj.getHash("HEX"))
  return shaObj.getHash("HEX")
}


const createUpPartUrl = (
  key: string,
  partNumber: number,
  uploadId: string,
) => {
  const mutltiPartUploadUrl = new URL(FILES_ENDPOINT)
  mutltiPartUploadUrl.searchParams.set('key', key)
  mutltiPartUploadUrl.searchParams.set('action', "mpu-uploadpart")
  mutltiPartUploadUrl.searchParams.set('uploadId', uploadId)
  mutltiPartUploadUrl.searchParams.set('partNumber', partNumber + "")
  return mutltiPartUploadUrl
}


export function xhrUpPart(
  storeName: "files" | "recordings",
  storeKey: string,
  setStore: SetUploadStore,
  key: string,
  partNumber: number,
  formData: FormData,
  uploadId: string,
  count: number = 0
) {
  const url = createUpPartUrl(key, partNumber, uploadId)
  const xhr = new XMLHttpRequest()
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setStore(storeName, storeKey, "ups", (ups: Array<number>) =>
          ups.map((u, i) => i === partNumber - 1
            ? event.loaded / event.total
            : u
          ))
      }
    })
    xhr.addEventListener("loadend", () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        const json = JSON.parse(xhr.responseText)
        resolve(json)
      }
    })

    xhr.addEventListener("error", (count > 3
      ? e => reject(e)
      : () => xhrUpPart(storeName, storeKey, setStore, key, partNumber, formData, uploadId, count + 1)
    ))
    xhr.open("PUT", url, true)
    xhr.withCredentials = true
    // xhr.setRequestHeader("Content-Type", "multipart/form-data")
    xhr.send(formData)
  })
}

async function getUploadFileParts(upItem: UpItem) {

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  const totalParts = Math.ceil(upItem.blob.size / CHUNK_SIZE)

  const url = new URL(FILES_ENDPOINT)
  url.searchParams.append('key', upItem.key)
  url.searchParams.append('action', 'mpu-create')

  const uploadIdResponse = await fetch(url, {
    credentials: 'include',
    method: 'POST'
  })

  const multiPartUploadJson = await uploadIdResponse.json()

  const uploadId = multiPartUploadJson.uploadId

  return {
    uploadId,
    forms: [...Array(totalParts).keys()].map(i => {
      const start = CHUNK_SIZE * i
      const end = Math.min(upItem.blob.size, start + CHUNK_SIZE)
      const blob = upItem.blob.slice(start, end)
      const formData = new FormData()
      formData.append('file', blob)
      return formData
    })
  }
}


const uploadItem = (
  storeName: "files" | "recordings",
  storeKey: string,
  upItem: UpItem,
  setStore: SetUploadStore
) => getUploadFileParts(upItem)
  .then(b => {
    const ups = b.forms.map(_ => 0)
    // setStore(storeName, storeKey, Object.assign({}, upItem, { ups }))
    console.log('trying to set uploadItem', storeKey, ups)
    setStore(storeName, storeKey, "ups", ups)
    console.log('set uploadItem', ups)
    return b
  })
  .then(({ uploadId, forms }) =>
    Promise.all(forms.map((formData, i) => xhrUpPart(storeName, storeKey, setStore, upItem.key, i + 1, formData, uploadId)))
      .then(parts => {
        const url = new URL(FILES_ENDPOINT)
        url.searchParams.set('action', "mpu-complete")
        url.searchParams.set('key', upItem.key)
        url.searchParams.set('uploadId', uploadId)
        return fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          method: 'POST',
          body: JSON.stringify({ parts })
        })
          .then(res => res.headers.get("content-type")?.indexOf("application/json") === -1
            ? res.text()
            : res.json()
          )
          .then(() => {
            setStore(storeName, storeKey, { ups: [], isUploaded: true })
          })

      })
  )
  .catch(e => console.log('error:', e))

const FileUploader: Component<{ upItem: UpItem }> = ({
  upItem
}) => {
  const status = () => {
    const u = upItem.ups
    const d = upItem.isUploaded
    const accum = u.reduce((acc, v) => acc + v, 0)
    return u.length === 0 && !d
      ? 'initiating'
      : accum === u.length && d
        ? 'done'
        : accum === u.length
          ? '...finalizing'
          : '...' + (accum / u.length * 100).toFixed(0) + '%'
  }
  return (
    <div class='flex flex-col gap-2'>
      {upItem.key} {status()}
      <div class='flex gap-2 flex-wrap'>
        <For each={upItem.ups}>{
          u =>
            <div class={u > 0.9 ? 'h-4 w-4 bg-green-200' : 'h-4 w-4 bg-green-800'} />
        }</For>
      </div>
    </div>
  )
}
function getExtension(subtype: string) {
  if (subtype === 'webm') return 'webm'
  if (subtype === 'mpeg') return 'mp3'
  if (subtype === 'ogg') return 'ogg'
  if (subtype === 'wav') return 'wav'
  if (subtype === 'aac') return 'aac'
  if (subtype === 'mp4') return 'mp4'
  return "webm"
}

export const RecItem: Component<{ upItem: UpItem, storeKey: string }> = ({ upItem, storeKey }) => {
  const [name, setName] = createSignal<string>('')
  const { store, setStore } = useUploadContext()
  const uploadRecItem = (name: string, blob: Blob, storeKey: string) => {
    calcDigest(blob)
      .then((hash) => {
        const reg = /audio\/([a-zA-Z0-9]*)[;|$]*/
        const res = reg.exec(blob.type)
        if (!res?.length || res.length < 2) {
          alert('Unrecognized mime type in recording.')
          return
        }
        const ext = getExtension(res[1])
        const key = name + '.' + hash.slice(0, 5) + '.' + ext
        console.log('setting key on recording', key, blob.type)
        setStore('recordings', storeKey, "key", key)
        uploadItem("recordings", storeKey, store.recordings[storeKey], setStore)
      })
  }
  // @ts-ignore
  const remove = () => setStore("recordings", storeKey, undefined)
  return (
    <div class="flex flex-col gap-0 bg-base-300 rounded p-0  border border-primary">
      <div class="flex flex-row-reverse gap-2">
        <button class="btn btn-sm btn-circle btn-ghost right-0 top-0" onClick={remove}>✕</button>
      </div>
      <div class="flex flex-col gap-4 p-4 pt-0">
        <audio class="flex-grow w-full" controls src={upItem.objUrl} />
        <Switch fallback={<div>...</div>}>
          <Match when={upItem.key}>
            <FileUploader upItem={upItem} />
          </Match>
          <Match when={!upItem.key}>
            <div class="flex gap-2">
              <label class="floating-label flex-grow">
                <span>Recording Name</span>
                <input
                  class="input bg-base-100"
                  placeholder="give your recording a name"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                class={"btn btn-primary flex-1 disabled:border disabled:border-2" + (name().trim() === '' ? 'cursor-not-allowed' : 'cursor-pointer')}
                disabled={name().trim() === ''}
                onClick={() => uploadRecItem(name(), upItem.blob, storeKey)}
              >upload</button>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

const RecordUI = () => {
  const [time, setTime] = createSignal<number>(0)
  const { store, setStore } = useUploadContext()
  let canvasRef!: HTMLCanvasElement
  let timerOn = false
  let cummulativeTime = 0
  let laststartTime = 0

  const startRecording = () => {
    setStore("isRecording", true)
    store.recorder.start()
  }

  const stopRecording = () => {
    store.recorder.stop()
    setStore("isRecording", false)
  }

  const toggleRecording = () => {
    if (store.isRecording) {
      stopRecording()
      timerOn = false
    } else {
      cummulativeTime = 0
      laststartTime = (new Date()).getTime()
      setTime(0)
      startRecording()
      timerOn = true
    }
  }


  onMount(() => {
    if (!canvasRef) return
    const canvasCtx = canvasRef.getContext('2d')
    const bufferLength = store.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    draw()
    let count = 0

    function draw() {
      if (!canvasCtx) return
      const WIDTH = canvasRef.width
      const HEIGHT = canvasRef.height

      requestAnimationFrame(draw)
      if (timerOn) {
        const currentTime = (new Date()).getTime()
        cummulativeTime += (currentTime - laststartTime)
        laststartTime = currentTime
        if (count++ > 10) {
          setTime(cummulativeTime / 1000)
          count = 0
        }
      }

      store.analyser.getByteTimeDomainData(dataArray)

      canvasCtx.fillStyle = 'rgb(0, 0, 0)'
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

      canvasCtx.lineWidth = 1.5
      canvasCtx.strokeStyle = 'rgb(244, 50, 100)'

      canvasCtx.beginPath()

      let sliceWidth = WIDTH * 1.0 / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {

        let v = dataArray[i] / 128.0
        let y = v * HEIGHT / 2

        if (i === 0) {
          canvasCtx.moveTo(x, y)
        } else {
          canvasCtx.lineTo(x, y)
        }
        x += sliceWidth
      }
      canvasCtx.lineTo(canvasRef.width, canvasRef.height / 2)
      canvasCtx.stroke()
    }
  })

  return (
    <div class="flex flex-col gap-4">
      <canvas ref={canvasRef} class='w-full h-32 rounded' />
      <button
        type="button"
        class="btn btn-primary btn-xl"
        onClick={toggleRecording}>{
          store.isRecording ? `Stop: ${formatTime(time())}` : 'Record'
        }</button>

    </div>
  )
}


const { selectFiles } = createFileUploader({ multiple: true, accept: "audio/*" })
const setFiles = (setStore: SetUploadStore) => () => selectFiles(([{ source, name, size, file }]) => {
  calcDigest(file)
    .then((hash) => {
      const key = name.replace(/\.([a-zA-Z0-9]*)$/, '.' + hash.slice(0, 5) + '.$1')
      console.log('new file', key, size)
      const upItem = { key, blob: file, ups: [], isUploaded: false, objUrl: source }
      setStore("files", key, upItem)
      uploadItem("files", key, upItem, setStore)
    })

})


const RecordDialog = () => {
  const { store, setStore } = useUploadContext()
  let dialogRef!: HTMLDialogElement
  const setupRecorder = () => {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return Promise.reject(new Error('No navigator.mediaDevices'))
    console.log('setup recorder')
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true
      }
    })
      .then(function(stream) {
        if (store.micSource) {
          store.micSource.disconnect()
        }
        const micSource = store.ctx.createMediaStreamSource(stream)
        setStore("micSource", micSource)
        micSource.connect(store.vol)
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err)
      })
  }

  const closeModal = () => {
    noSleep.disable()
  }
  const clickCloseModal = () => dialogRef.close()

  const openModal = () => {
    dialogRef.showModal()
    noSleep.enable()
    if (store.ctx.state !== 'running') {
      store.ctx.resume()
        .then(() => console.log('ctx resumed'))
        .catch(console.warn)
    }
    console.log('open')
    setupRecorder()
      .catch(console.warn)
  }
  return (
    <>
      <button class="btn btn-primary btn-xl" onClick={openModal}>Record</button>

      <dialog ref={dialogRef} class="modal" onClose={closeModal}>
        <div class="modal-box bg-base-200 p-0">
          <div class="flex flex-row-reverse gap-1 w-full">
            <button class="btn btn-sm btn-circle btn-ghost right-0 top-0" onClick={clickCloseModal}>✕</button>
          </div >
          <div class="flex flex-col gap-4 w-full h-2/3 overflow-y-auto p-4 pt-0">
            <RecordUI />
            <For each={Object.entries(store.recordings).reverse()}>
              {([storeKey, upItem]) => <RecItem storeKey={storeKey} upItem={upItem} />}
            </For>
          </div>
        </div >

        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  )
  /*
return (
<>
        <button class="btn btn-primary btn-xl" onClick={openModal}>Record</button>
        <dialog ref={dialogRef} class="modal" onClose={closeModal}>
          <div class="modal-box bg-base-200 p-0">
            <div class="flex flex-row-reverse gap-1 w-full">
              <button class="btn btn-sm btn-circle btn-ghost right-0 top-0">✕</button>
            </div >
            <div class="flex flex-col gap-4 w-full h-2/3 overflow-y-auto p-4 pt-0">
              <RecordUI />
              <For each={Object.entries(store.recordings).reverse()}>
                {([storeKey, upItem]) => <RecItem storeKey={storeKey} upItem={upItem} />}
              </For>
            </div>
          </div >
            <form method="dialog" class="modal-backdrop">
              <button>close</button>
            </form>

        </dialog >
      </>
      )
      */
}

const TextDialog = () => {
  const [textInput, setTextInput] = createSignal<string>('')
  const [voiceId, setVoiceId] = createSignal<string>('1oempTd4AdVbMXTwXGLb')
  const [isLoading, setIsLoading] = createSignal<boolean>(false)
  const [error, setError] = createSignal<string>('')
  const { store, setStore } = useUploadContext()
  let dialogRef!: HTMLDialogElement

  const closeModal = () => {
    noSleep.disable()
    setTextInput('')
    setError('')
    // Clean up any non-uploaded TTS recordings
    Object.entries(store.recordings).forEach(([key, upItem]) => {
      if (key.startsWith('TTS-') && !upItem.isUploaded && !upItem.key) {
        if (upItem.objUrl) {
          URL.revokeObjectURL(upItem.objUrl)
        }
        setStore("recordings", key, undefined)
      }
    })
  }
  const clickCloseModal = () => dialogRef.close()

  const openModal = () => {
    dialogRef.showModal()
    noSleep.enable()
  }

  const handleSubmit = async () => {
    const text = textInput().trim()
    if (text === '') return

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(WORKERS_URL + '/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ text, voice_id: voiceId() })
      })

      if (response.ok) {
        // Check if response is audio
        const contentType = response.headers.get('Content-Type')
        if (contentType?.includes('audio')) {
          const audioBlob = await response.blob()
          const url = URL.createObjectURL(audioBlob)

          // Create UpItem for the TTS audio and add to recordings store
          const timestamp = new Date(Date.now()).toLocaleString('us')
          const storeKey = `TTS-${timestamp}`
          const upItem: UpItem = {
            blob: audioBlob,
            key: '', // Will be set when user uploads
            objUrl: url,
            ups: [],
            isUploaded: false
          }
          setStore("recordings", storeKey, upItem)

          console.log('Audio generated successfully')
        } else {
          setError('Unexpected response format from server')
        }
      } else {
        let errorMessage = `Failed to generate audio (${response.status})`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch {
          // If we can't parse the error response, use the default message
        }
        setError(errorMessage)
      }
    } catch (error) {
      setError('Network error occurred. Please try again.')
      console.error('Error generating audio:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button class="btn btn-primary btn-xl" onClick={openModal}>Text</button>

      <dialog ref={dialogRef} class="modal" onClose={closeModal}>
        <div class="modal-box bg-base-200 p-0 ">
          <div class="flex flex-row-reverse gap-1 w-full">
            <button class="btn btn-sm btn-circle btn-ghost right-0 top-0" onClick={clickCloseModal}>✕</button>
          </div >
          <div class="flex flex-col gap-4 w-full h-2/3 overflow-y-auto p-4 pt-0">
            <div class="flex flex-col gap-4 p-4">
              <label class="floating-label">
                <span>Voice</span>
                <select
                  class="select bg-base-100 w-full"
                  value={voiceId()}
                  onChange={(e) => setVoiceId(e.currentTarget.value)}
                >
                  <option value="1oempTd4AdVbMXTwXGLb">Pulse-6 - Ma</option>
                  <option value="HlyKh32Jf2YC5G3m6nSp">Pulse-8 - br</option>
                  <option value="PM95oPAGQiOSwicBkAKM">Pulse-5 - de</option>
                  <option value="bc3xKmxFdtlGMxZSJTpJ">Pulse-4 - Na</option>
                  <option value="h3pRrljMaFBWaThMoUWH">Pulse-7 - h</option>
                  <option value="n7IAf15stpfCFyev4toS">Pulse-2 - V</option>
                  <option value="pYg9EmuR9dI8GIzOQddT">Pulse-3 - isa</option>
                  <option value="qjz0ZBNwjrj7MIhECSVN">Pulse-1 - i</option>
                </select>
              </label>
              <label class="floating-label">
                <span>Your Message</span>
                <textarea
                  class="textarea bg-base-100 min-h-32 w-full p-2"
                  placeholder="Enter your text message here..."
                  value={textInput()}
                  onInput={(e) => setTextInput(e.currentTarget.value)}
                />
              </label>
              <button
                type="submit"
                class={"btn btn-primary flex-1 disabled:border disabled:border-2 btn-xl " + (textInput().trim() === '' || isLoading() ? 'cursor-not-allowed' : 'cursor-pointer')}
                disabled={textInput().trim() === '' || isLoading()}
                onClick={handleSubmit}
              >
                {isLoading() ? (
                  <>
                    <span class="loading loading-spinner loading-sm"></span>
                    Generating...
                  </>
                ) : 'Submit'}
              </button>
              {error() && (
                <div class="alert alert-error">
                  <span>{error()}</span>
                </div>
              )}
              <For each={Object.entries(store.recordings).filter(([key]) => key.startsWith('TTS-')).reverse()}>
                {([storeKey, upItem]) => <RecItem storeKey={storeKey} upItem={upItem} />}
              </For>
            </div>
          </div>
        </div >

        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  )
}


function App() {

  const { store, setStore } = useUploadContext()
  const { setRef: dropzoneRef } = createDropzone({
    onDrop: async files => {
      files.forEach(f => console.log(f))
      // setStore("files", name, { key: name, blob: file, ups: [], isUploaded: false })
    },
    onDragOver: files => console.log("over", files.length),
  })

  return (
    <>
      <div ref={dropzoneRef} class="w-screen h-screen flex justify-center items-center" >
        <div class="flex flex-col gap-4 items-center w-full md:w-1/2 ">
          <div class="flex gap-4">
            <RecordDialog />
            <button
              type="button"
              class="btn btn-primary btn-xl"
              onClick={setFiles(setStore)}
            >
              Upload
            </button>
            <TextDialog />
          </div>
          <div class="flex flex-col gap-4 max-w-1/2">
            <For each={Object.values(store.files)}>{f => <FileUploader upItem={f} />}</For>
          </div>
        </div >
      </div >
    </>
  )
}

const root = document.getElementById('root')
render(() => <UploadProvider><App /></UploadProvider>, root!)
