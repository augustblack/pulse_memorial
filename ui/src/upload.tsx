/* @refresh reload */
import { render, Portal } from 'solid-js/web'
import { createStore, unwrap } from "solid-js/store"
import { Show, For, Switch, Match, createSignal, onMount } from 'solid-js'
import type { Component } from 'solid-js'
import { createDropzone, createFileUploader, fileUploader } from "@solid-primitives/upload"
import jsSHA from 'jssha'
import { MediaRecorder } from 'extendable-media-recorder'

import './index.css'

type R2UploadedPart = {
  partNumber: number,
  etag: string
}

type UpItem = {
  blob: Blob | File
  key: string
  objUrl?: string
  ups: Array<number>
  isUploaded: boolean
  upParts?: Array<R2UploadedPart>
}

type UpStore = {
  isRecording: boolean
  recordings: Record<string, UpItem>
  files: Record<string, UpItem>
}

const [store, setStore] = createStore<UpStore>({
  isRecording: false,
  recordings: {},
  files: {}
})

fileUploader;

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
      : () => xhrUpPart(storeName, storeKey, key, partNumber, formData, uploadId, count + 1)
    ))
    xhr.open("PUT", url, true)
    xhr.withCredentials = true
    // xhr.setRequestHeader("Content-Type", "multipart/form-data")
    xhr.send(formData)
  })
}
export async function uploadPart(
  key: string,
  partNumber: number,
  formData: FormData,
  uploadId: string,
  count: number = 0
): Promise<R2UploadedPart> {
  const url = createUpPartUrl(key, partNumber, uploadId)
  try {
    const uploadPartResponse = await fetch(url, {
      method: 'PUT',
      body: formData,
    })
    const uploadPartJson = await uploadPartResponse.json()
    console.log('uploadPartResponse', uploadPartJson)
    return uploadPartJson
  } catch (e) {
    console.log('got error:', e)
    return count < 3
      ? uploadPart(key, partNumber, formData, uploadId, count + 1)
      : Promise.reject(new Error(`Tried 3 times to upload part ${partNumber} and failed.`))
  }
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

const uploadItem = (storeName: "files" | "recordings", storeKey: string, upItem: UpItem) => getUploadFileParts(upItem)
  .then(b => {
    const ups = b.forms.map(_ => 0)
    // setStore(storeName, storeKey, Object.assign({}, upItem, { ups }))
    console.log('trying to set uploadItem', storeKey, ups)
    setStore(storeName, storeKey, "ups", ups)
    console.log('set uploadItem', ups)
    return b
  })
  .then(({ uploadId, forms }) =>
    Promise.all(forms.map((formData, i) => xhrUpPart(storeName, storeKey, upItem.key, i + 1, formData, uploadId)))
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
            console.log('store', unwrap(store))
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

const ctx = new AudioContext()
let micSource: MediaStreamAudioSourceNode
const vol = ctx.createGain()
const analyser = ctx.createAnalyser()
analyser.fftSize = 2048
const compressor = ctx.createDynamicsCompressor()
compressor.threshold.value = -30.0  //  less intene for vocal
compressor.knee.value = 15.0 // between 6-20 (somewhere in this range) ,
compressor.ratio.value = 7.0 // max compression
compressor.attack.value = 0.003 // 3ms attack
compressor.release.value = 0.030

const limiter = ctx.createDynamicsCompressor()
limiter.threshold.value = -1.0 // this is the pitfall, leave some headroom
limiter.knee.value = 4.0 // 3-6 range 
limiter.ratio.value = 12.0 // 10-15 range 
limiter.attack.value = 0.007 // 5-10ms attack
limiter.release.value = 0.050

const dest = ctx.createMediaStreamDestination()
const recorder = new MediaRecorder(dest.stream, { audioBitsPerSecond: 192000 })
vol.gain.value = 1
vol
  .connect(compressor)
  .connect(limiter)
  .connect(analyser)
  .connect(dest)
recorder.onstart = () => console.log('start recording')
recorder.ondataavailable = function(e) {
  const d = new Date(Date.now()).toLocaleString('us')
  const name = d.toLocaleString()
  const upItem = { blob: e.data, ups: [], isUploaded: false, objUrl: window.URL.createObjectURL(e.data) }
  setStore("recordings", name, upItem)
  //  e.data.type
}
recorder.onstop = function() {
  console.log('stop')
}

export const setupRecorder = () => {
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
      if (micSource) {
        micSource.disconnect()
      }
      micSource = ctx.createMediaStreamSource(stream)
      micSource.connect(vol)
    })
    .catch((err) => {
      console.error('Error accessing microphone:', err)
    })
}


const startRecording = () => {
  setStore("isRecording", true)
  recorder.start()
}

const stopRecording = () => {
  recorder.stop()
  setStore("isRecording", false)
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
      uploadItem("recordings", storeKey, store.recordings[storeKey])
    })
}

export const RecItem: Component<{ upItem: UpItem, storeKey: string }> = ({ upItem, storeKey }) => {
  const [name, setName] = createSignal<string>('')
  return (
    <div class="flex flex-col gap-2 bg-red-600 rounded p-4">
      <div>{upItem.key}</div>
      <audio class="flex-grow" controls src={upItem.objUrl} />
      <Switch fallback={<div>...</div>}>
        <Match when={upItem.key}>
          <FileUploader upItem={upItem} />
        </Match>
        <Match when={!upItem.key}>
          <div class="flex gap-2">
            <input
              class="flex-grow p-2 rounded bg-gray-100"
              placeholder="give your recording a name please"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            >upload</input>
            <button
              type="button"
              class={"flex-none p-2 rounded bg-red-200 " + (name().trim() === '' ? 'cursor-not-allowed' : 'cursor-pointer')}
              disabled={name().trim() === ''}
              onClick={() => uploadRecItem(name(), upItem.blob, storeKey)}
            >upload</button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}

const RecordUI = () => {
  const [time, setTime] = createSignal<number>(0)
  let canvasRef!: HTMLCanvasElement
  let timerOn = false
  let cummulativeTime = 0
  let laststartTime = 0

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
    const bufferLength = analyser.frequencyBinCount
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

      analyser.getByteTimeDomainData(dataArray)

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
    <div class="flex gap-4">
      <button
        type="button"
        class="bg-red-600 rounded p-4 cursor-pointer"
        onClick={toggleRecording}>{
          store.isRecording ? `Stop: ${formatTime(time())}` : 'Record'
        }</button>
      <canvas ref={canvasRef} class='w-full h-32' />
    </div>
  )
}

function createModal() {
  const [open, setOpen] = createSignal(false)
  return {
    openModal() {
      if (ctx.state !== 'running') {
        ctx.resume()
          .then(() => console.log('ctx resumed'))
          .catch(console.warn)
      }
      console.log('open')
      setupRecorder()
        .then(() => setOpen(true))
        .catch(console.warn)
    },
    Modal() {
      return (
        <Portal>
          <Show when={open()}>
            <div class="w-screen h-screen flex justify-center items-center z-2 absolute left-0 top-0" >
              <div class="w-screen h-screen flex justify-center items-center z-2 absolute left-0 top-0 bg-red-900 opacity-30" onClick={() => setOpen(false)} />
              <div class="flex flex-col gap-4 items-center w-full h-full lg:h-4/5 lg:w-2/3 z-4 bg-red-400 rounded opacity-100 p-4">
                <RecordUI />
                <button onClick={() => setOpen(false)}>Close</button>
                <div class="flex flex-col gap-4 w-full lg:w-1/2 h-2/3 overflow-y-auto">
                  <For each={Object.entries(store.recordings).reverse()}>
                    {([storeKey, upItem]) => <RecItem storeKey={storeKey} upItem={upItem} />}
                  </For>
                </div>
              </div >
            </div >
          </Show>
        </Portal>
      )
    }
  }
}
const { selectFiles } = createFileUploader({ multiple: true, accept: "audio/*" })
const setFiles = () => selectFiles(([{ source, name, size, file }]) => {
  calcDigest(file)
    .then((hash) => {
      const key = name.replace(/\.([a-zA-Z0-9]*)$/, '.' + hash.slice(0, 5) + '.$1')
      console.log('new file', key, size)
      const upItem = { key, blob: file, ups: [], isUploaded: false, objUrl: source }
      setStore("files", key, upItem)
      uploadItem("files", key, upItem)
    })

})


function App() {
  const { setRef: dropzoneRef } = createDropzone({
    onDrop: async files => {
      files.forEach(f => console.log(f));
      // setStore("files", name, { key: name, blob: file, ups: [], isUploaded: false })
    },
    onDragOver: files => console.log("over", files.length),
  })
  const { Modal, openModal } = createModal()

  return (
    <>
      <div ref={dropzoneRef} class="w-screen h-screen flex justify-center items-center" >
        <div class="flex flex-col gap-4 items-center w-full md:w-1/2 ">
          <div class="flex gap-4">
            <button type="button" class="rounded bg-red-600 text-red-100 p-4 cursor-pointer" onClick={openModal}>
              Record
            </button>
            <button
              type="button"
              class="rounded bg-red-600 text-red-100 p-4 cursor-pointer"
              onClick={setFiles}
            >
              Upload
            </button>
          </div>
          <div class="flex flex-col gap-4 max-w-1/2">
            <For each={Object.values(store.files)}>{f => <FileUploader upItem={f} />}</For>
          </div>
        </div >
      </div >
      <Modal />
    </>
  )
}

const root = document.getElementById('root')
render(() => <App />, root!)
