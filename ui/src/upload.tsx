/* @refresh reload */
import { render } from 'solid-js/web'
import { For, Component, Setter, createSignal } from 'solid-js'
import { createDropzone, createFileUploader, fileUploader } from "@solid-primitives/upload"
import jsSHA from 'jssha'
import './index.css'

type R2UploadedPart = {
  partNumber: number,
  etag: string
}

fileUploader;

//VITE_WS_URL='http://localhost:8787'
const WORKERS_URL = import.meta.env.VITE_WS_URL || window.location
const FILES_ENDPOINT = WORKERS_URL + '/files'

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
  const status = () => {
    const u = ups()
    const accum = u.reduce((acc, v) => acc + v, 0)
    return u.length === 0
      ? 'initiating'
      : accum === u.length
        ? 'done'
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
        .then(console.log)
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

function App() {
  const { setRef: dropzoneRef, files: droppedFiles } = createDropzone({
    onDrop: async files => {
      files.forEach(f => console.log(f));
    },
    onDragOver: files => console.log("over", files.length),
  })
  const { files, selectFiles } = createFileUploader()

  return (
    <div ref={dropzoneRef} class="w-screen h-screen bg-red-200 flex justify-center items-center bg-red-200" >
      <div class="flex flex-col gap-4 items-center w-full md:w-1/2 ">

        <div class="flex gap-4">
          <button class="rounded bg-red-600 text-red-100 p-4">
            Record
          </button>
          <button class="rounded bg-red-600 text-red-100 p-4" onClick={() => selectFiles(console.log)}>
            Upload
          </button>
        </div>
        <div class="flex flex-col gap-4 max-w-1/2">
          <For each={files()}>{f => <FileUploader file={f.file} />}</For>
          <For each={droppedFiles()}>{f => <FileUploader file={f.file} />}</For>
        </div>
      </div >

    </div >
  )
}

render(() => <App />, root!)
