import { render } from 'solid-js/web'
import { createResource, createSignal, For } from 'solid-js'
import './index.css'


//VITE_WS_URL='http://localhost:8787'
const WORKERS_URL = import.meta.env.VITE_WS_URL || (window.location.protocol + '//' + window.location.hostname)
const FILES_ENDPOINT = (WORKERS_URL + '/files').replace(/([^:]\/)\/+/g, "$1")
console.log('WORKERS_URL', WORKERS_URL)
console.log('FILES_ENDPOINT', FILES_ENDPOINT)


const url = new URL(FILES_ENDPOINT)
url.searchParams.set('action', "list")

const fetchUser = async () => (await fetch(url, { credentials: 'include' })).json()

function App() {
  const [fetchCount, setFetchCount] = createSignal(0)
  const [files] = createResource(fetchCount, fetchUser)
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
  const handleDelete = async (key: string) => {
    if (!confirm(`Are you sure you want to delete ${key}?`)) {
      return
    }
    const u = new URL(FILES_ENDPOINT)
    u.searchParams.set("action", "delete")
    u.searchParams.set("key", key)
    fetch(u, {
      method: "DELETE",
      credentials: 'include'
    })
      .then(res => res.ok
        ? res.text()
        : res.text()
      )
      .then(() => setFetchCount(fc => fc + 1))
      .catch(console.warn)
  }


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
                <button class="cursor-pointer flex-none" onclick={() => handleDelete(u.key)}>x</button>
              </div>
          }</For >
          <button class="p-2 rounded bg-red-900 hidden" onclick={onClick}>{clear()}</button>
        </div>
      </div>
    </div >
  )
}

const root = document.getElementById('root')
render(() => <App />, root!)
