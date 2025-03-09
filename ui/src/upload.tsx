/* @refresh reload */
import { render, Portal } from 'solid-js/web'
import { Show, For, Component, Setter, createSignal, onMount } from 'solid-js'
import { createDropzone, createFileUploader, fileUploader } from "@solid-primitives/upload"
import jsSHA from 'jssha'
import { MediaRecorder } from 'extendable-media-recorder'

import './index.css'

type R2UploadedPart = {
  partNumber: number,
  etag: string
}

fileUploader;

//VITE_WS_URL='http://localhost:8787'
const WORKERS_URL = import.meta.env.VITE_WS_URL || (window.location.protocol + '//' + window.location.hostname)
const FILES_ENDPOINT = (WORKERS_URL + '/files').replace(/([^:]\/)\/+/g, "$1")
console.log('WORKERS_URL', WORKERS_URL)
console.log('FILES_ENDPOINT', FILES_ENDPOINT)

export async function calcDigest(file: File) {
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
export async function getFileHash(file: File, algorithm = 'SHA-1') {
  file.stream
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
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
  key: string,
  partNumber: number,
  formData: FormData,
  uploadId: string,
  setUps: Setter<Array<number>>,
  count: number = 0
) {
  const url = createUpPartUrl(key, partNumber, uploadId)
  const xhr = new XMLHttpRequest()
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setUps(ups => ups.map((u, i) => i === partNumber - 1
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
      : () => xhrUpPart(key, partNumber, formData, uploadId, setUps, count + 1)
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
  setUps: Setter<Array<number>>,
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
      ? uploadPart(key, partNumber, formData, uploadId, setUps, count + 1)
      : Promise.reject(new Error(`Tried 3 times to upload part ${partNumber} and failed.`))
  }
}

async function getUploadFileParts(file: File) {

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  const totalParts = Math.ceil(file.size / CHUNK_SIZE)

  const hash = await calcDigest(file)
  const key = file.name.replace(/\.([a-zA-Z0-9]*)$/, '.' + hash.slice(0, 5) + '.$1')

  const url = new URL(FILES_ENDPOINT)
  url.searchParams.append('key', key)
  url.searchParams.append('action', 'mpu-create')

  const uploadIdResponse = await fetch(url, {
    credentials: 'include',
    method: 'POST'
  })

  const multiPartUploadJson = await uploadIdResponse.json()

  const uploadId = multiPartUploadJson.uploadId

  return {
    key,
    uploadId,
    forms: [...Array(totalParts).keys()].map(i => {
      const start = CHUNK_SIZE * i
      const end = Math.min(file.size, start + CHUNK_SIZE)
      const blob = file.slice(start, end)
      const formData = new FormData()
      formData.append('file', blob)
      return formData
    })
  }
}

const root = document.getElementById('root')

const FileUploader: Component<{ file: File }> = ({
  file
}) => {
  const [ups, setUps] = createSignal<Array<number>>([])
  const [done, setDone] = createSignal<boolean>(false)
  const status = () => {
    const u = ups()
    const d = done()
    const accum = u.reduce((acc, v) => acc + v, 0)
    return u.length === 0 && !d
      ? 'initiating'
      : accum === u.length && d
        ? 'done'
        : accum === u.length
          ? '...finalizing'
          : '...' + (accum / u.length * 100).toFixed(0) + '%'
  }
  getUploadFileParts(file)
    .then(b => {
      setUps(b.forms.map(_ => 0))
      return b
    })
    .then(({ key, uploadId, forms }) =>
      Promise.all(forms.map((formData, i) => xhrUpPart(key, i + 1, formData, uploadId, setUps)))
        .then(parts => {
          const url = new URL(FILES_ENDPOINT)
          url.searchParams.set('action', "mpu-complete")
          url.searchParams.set('key', key)
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
        })
        .then(res => res.headers.get("content-type")?.indexOf("application/json") === -1
          ? res.text()
          : res.json()
        )
        .then(() => {
          setDone(true)
          setUps([])
        })
    )
    .catch(e => console.log('error:', e))
  return (
    <div class='flex flex-col gap-2'>
      {file.name} {status()}
      <div class='flex gap-2 flex-wrap'>
        <For each={ups()}>{
          u =>
            <div class={u > 0.9 ? 'h-4 w-4 bg-green-200' : 'h-4 w-4 bg-green-800'} />
        }</For>
      </div>
    </div>
  )
}

type FileRec = {
  blob: Blob
  name: string
  objUrl: string
  isUploaded: boolean
}

const [isRecording, setIsRecording] = createSignal(false)
const [recordings, setRecordings] = createSignal<Array<FileRec>>([])


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
  console.log('data', name, e.data)
  setRecordings(r => [{
    blob: e.data,
    name,
    objUrl: window.URL.createObjectURL(e.data),
    isUploaded: false
  }, ...r])
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
  setIsRecording(true)
  recorder.start()
}

const stopRecording = () => {
  recorder.stop()
  setIsRecording(false)
}

const toggleRecording = () => {
  console.log('toggleRecording')
  if (isRecording()) {
    stopRecording()
  } else {
    startRecording()
  }
}
export const RecItem: Component<{ fileRec: FileRec }> = ({ fileRec }) => {
  return (
    <div class="flex flex-col">
      <div>{fileRec.name}</div>
      <audio class="flex-grow" controls src={fileRec.objUrl} />
      <button class="flex-none p-2 rounded ">upload</button>
    </div>
  )
}


const RecordUI = () => {
  let canvasRef: HTMLCanvasElement
  let timerOn = false

  onMount(() => {
    if (!canvasRef) return
    const canvasCtx = canvasRef.getContext('2d')
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let cummulativeTime = 0
    let laststartTime = 0

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
        if (count++ > 100) {
          // setTime(cummulativeTime / 1000)
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
      <button type="button" onClick={() => toggleRecording()}>{isRecording() ? 'Stop' : 'Record'}</button>
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
              <div class="w-screen h-screen flex justify-center items-center z-2 absolute left-0 top-0 bg-red-900 opacity-30" />
              <div class="flex flex-col gap-4 items-center w-full h-4/5 md:w-1/2 z-4 bg-red-400 rounded opacity-100 p-4">
                <RecordUI />
                <button onClick={() => setOpen(false)}>Close</button>
                <div class="flex flex-col gap-4 max-w-1/2 h-2/3 overflow-y-auto">
                  <For each={recordings()}>{f => <RecItem fileRec={f} />}</For>
                </div>
              </div >
            </div >
          </Show>
        </Portal>
      )
    }
  }
}
function App() {
  const { setRef: dropzoneRef, files: droppedFiles } = createDropzone({
    onDrop: async files => {
      files.forEach(f => console.log(f));
    },
    onDragOver: files => console.log("over", files.length),
  })
  const { Modal, openModal } = createModal()
  const { files, selectFiles } = createFileUploader()

  return (
    <>
      <div ref={dropzoneRef} class="w-screen h-screen flex justify-center items-center" >
        <div class="flex flex-col gap-4 items-center w-full md:w-1/2 ">
          <div class="flex gap-4">
            <button type="button" class="rounded bg-red-600 text-red-100 p-4" onClick={openModal}>
              Record
            </button>
            <button type="button" class="rounded bg-red-600 text-red-100 p-4" onClick={() => selectFiles(console.log)}>
              Upload
            </button>
          </div>
          <div class="flex flex-col gap-4 max-w-1/2">
            <For each={files()}>{f => <FileUploader file={f.file} />}</For>
            <For each={droppedFiles()}>{f => <FileUploader file={f.file} />}</For>
          </div>
        </div >
      </div >
      <Modal />
    </>
  )
}

render(() => <App />, root!)
