import { render } from 'solid-js/web'
import './index.css'

const Mockup = () => {
  return (
    <div class="w-screen h-screen overflow-x-auto overflow-y-hidden relative">
      <img
        src="https://assets.pulse.memorial/media/pulse_panel.webp"
        width="8569"
        height="2854"
        class="h-full max-w-none"
        style="width: calc(100vh * 8569 / 2854);"
      />
      <div class="absolute left-10 top-6 fixed bg-black/50 p-4 flex flex-col gap-4 rounded">
        <audio src="https://assets.pulse.memorial/media/pulse-ghost.mp3" controls />
      </div>
    </div>
  )
}

const root = document.getElementById('root')
render(() => (
  <Mockup />
), root!)
