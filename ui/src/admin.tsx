import { render } from 'solid-js/web'
import { createResource, createSignal, For } from 'solid-js'
import './index.css'


//VITE_WS_URL='http://localhost:8787'
const WORKERS_URL = import.meta.env.VITE_WS_URL || window.location
const FILES_ENDPOINT = WORKERS_URL + '/files'

const url = new URL(FILES_ENDPOINT)
url.searchParams.set('action', "list")

const fetchUser = async () => (await fetch(url, { credentials: 'include' })).json()

function App() {
  const [files] = createResource("", fetchUser)
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

  return (
    <div class="w-screen h-screen bg-red-200 flex justify-center items-center bg-red-200" >
      <div>

        <div class="flex flex-col gap-2">

          <For each={files()}>{
            u =>
              <div class='bg-red-600 text-red-100 p-2 rounded' >
                <a href={'https://assets.pulse.memorial/' + encodeURIComponent(u.key)}>{u.key}</a>
              </div>
          }</For >
        </div>
        <button onclick={onClick}>{clear()}</button>
      </div>

    </div >
  )
}

const root = document.getElementById('root')
render(() => <App />, root!)
