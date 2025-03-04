import { render } from 'solid-js/web'
import { createResource, createSignal, For } from 'solid-js'
import './index.css'


//VITE_WS_URL='http://localhost:8787'
const WORKERS_URL = import.meta.env.VITE_WS_URL || (window.location.protocol + '//' + window.location.hostname)
const FILES_ENDPOINT = (WORKERS_URL + '/files').replace(/([^:]\/)\/+/g, "$1")
// const CLEAR_ENDPOINT = (WORKERS_URL + '/ws/clear').replace(/([^:]\/)\/+/g, "$1")
console.log('WORKERS_URL', WORKERS_URL)
console.log('FILES_ENDPOINT', FILES_ENDPOINT)

const fetchUser = async () => {
  const url = new URL(FILES_ENDPOINT)
  url.searchParams.set('action', "list")
  return (await fetch(url, { credentials: 'include' })).json()
}
const deleteUser = async (key: string) => {
  if (key.trim() === '') return ""
  if (!confirm(`Are you sure you want to delete ${key}?`)) {
    return
  }
  const url = new URL(FILES_ENDPOINT)
  url.searchParams.set("action", "delete")
  url.searchParams.set("key", key)
  return await fetch(url, {
    method: "DELETE",
    credentials: 'include'
  })
    .then(res => res.ok
      ? key
      : res.text()
    )
}

const [clear, setClear] = createSignal("clear")
const onClick = () => {
  setClear('...')
  fetch('/ws/clear', {
    method: "POST",
    credentials: 'include'
  })
    .then(() => {
      setClear('cleared')
      setTimeout(() => {
        setClear('clear')
      }, 2000)
    })
    .catch(console.warn)
}

function App() {
  const [delKey, setDelKey] = createSignal('')
  const [deleted] = createResource(delKey, deleteUser)
  const [files] = createResource(deleted, fetchUser)

  return (
    <div class="w-screen h-screen bg-red-200 flex justify-center items-center bg-red-200" >
      <div>
        <div class="flex flex-col gap-2">
          <For each={files()}>{
            u =>
              <div class="bg-red-600 text-red-100 p-2 rounded flex items-center gap-4" >
                <div class="flex-grow" >
                  <a class="cursor-pointer" href={'https://assets.pulse.memorial/' + encodeURIComponent(u.key)}>{u.key} </a>
                  <div class="text-xs">{u.uploaded}</div>
                </div>
                <button class="cursor-pointer flex-none" onclick={() => setDelKey(u.key)}>x</button>
              </div>
          }</For >
          <button class="p-2 rounded bg-red-900 " onclick={onClick}>{clear()}</button>
        </div>
      </div>
    </div >
  )
}

const root = document.getElementById('root')
render(() => <App />, root!)
