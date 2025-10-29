import { render } from 'solid-js/web'
import { For, createSignal, createEffect } from 'solid-js'
import { AudioProvider, useAudioContext, AudioClip } from './audioContext'
import './index.css'

const TOTAL_TRACKS = 49
const TIMELINE_HOURS = 3
const TIMELINE_SECONDS = TIMELINE_HOURS * 60 * 60

const VERTICAL_ZOOM_LEVELS = [
  { value: 'h-32', label: 'Large' },
  { value: 'h-16', label: 'Medium' },
  { value: 'h-8', label: 'Small' },
  { value: 'h-4', label: 'Tiny' },
  { value: 'h-2', label: 'Minimal' }
]

const AudioClipComponent = (props: { clip: AudioClip, zoom: number }) => (
  <div
    class="absolute top-0 text-xs text-white font-medium pointer-events-auto cursor-move h-full"
    style={{
      left: `${props.clip.startTime * props.zoom}px`,
      width: `${props.clip.duration * props.zoom}px`,
      'background-color': props.clip.color,
    }}
    title={`${props.clip.name} (${props.clip.duration.toFixed(1)}s)`}
  >
    {props.clip.name}
  </div>
)
const Markers = (props: { vzoom: string, hzoom: number, showMarkers?: boolean }) => {
  const { state } = useAudioContext()

  const timeMarkers = () => {
    const markers = []
    const pixelsPerSecond = props.hzoom

    // Mark every 10 minutes starting from the offset (include 3:00:00 endpoint)
    for (let minutes = 0; minutes <= 180; minutes += 10) {
      const seconds = minutes * 60
      const x = seconds * pixelsPerSecond
      const hours = Math.floor(minutes / 60)
      const displayMinutes = minutes % 60

      const label = hours > 0
        ? `${hours}:${displayMinutes.toString().padStart(2, '0')}:00`
        : `${displayMinutes}:00`

      markers.push({ x, label })
    }
    return markers
  }


  return (
    <div class={` ${props.vzoom} bg-blue-100  mb-1 z-10`}
      style={{
        width: `${TIMELINE_SECONDS * props.hzoom}px`,
        top: "-14px"
      }}

    >
      {props.showMarkers ? (
        <For each={timeMarkers()}>{marker => (
          <div
            class="absolute text-xs pointer-events-none top-0"
            style={{ left: `${marker.x}px` }}
          >
            {marker.label}
          </div>
        )}</For>
      ) : null}
    </div>
  )
}


const Track = (props: { trackNumber: number, vzoom: string, hzoom: number, showMarkers?: boolean }) => {
  const { state } = useAudioContext()

  const trackClips = () => state.clips.filter(clip => clip.trackIndex === props.trackNumber - 1)

  return (
    <div class={` ${props.vzoom} relative bg-base-300  mb-1`}
      style={{ width: `${TIMELINE_SECONDS * props.hzoom}px` }}
    >
      {/* Audio clips */}
      <For each={trackClips()}>{clip => (
        <AudioClipComponent clip={clip} zoom={props.hzoom} />
      )}</For>
    </div>
  )
}


const PlaybackControls = () => {
  const { state, setState } = useAudioContext()

  const togglePlayback = () => {
    if (!state.audioContext) {
      console.log('No audio context available')
      return
    }

    console.log('Toggle playback:', state.isPlaying ? 'stopping' : 'starting')
    console.log('Current time:', state.currentTime)
    console.log('Audio context time:', state.audioContext.currentTime)
    console.log('Clips:', state.clips)

    if (state.isPlaying) {
      // Stop playback
      setState('isPlaying', false)
    } else {
      // Start playback - ensure audio context is resumed
      if (state.audioContext.state === 'suspended') {
        state.audioContext.resume().then(() => {
          console.log('Audio context resumed')
        })
      }

      // Reset to beginning and start playback
      setState('currentTime', 0)
      setState('isPlaying', true)
      setState('playStartTime', state.audioContext.currentTime)
      setState('timelineStartTime', 0)
    }
  }

  return (
    <div class="flex items-center gap-2">
      <button
        class="btn btn-primary btn-sm"
        onClick={togglePlayback}
        disabled={!state.audioContext}
      >
        {state.isPlaying ? 'Pause' : 'Play'}
      </button>
      <span class="text-sm">
        {Math.floor(state.currentTime / 60)}:{Math.floor(state.currentTime % 60).toString().padStart(2, '0')}
      </span>
    </div>
  )
}

const ZoomControls = (props: {
  horizontalZoom: number
  verticalZoom: string
  onHorizontalZoom: (zoom: number) => void
  onVerticalZoom: (zoom: string) => void
}) => (
  <div class="flex gap-8 p-2 items-center">
    <PlaybackControls />

    <div class="flex items-center gap-2">
      <span class="flex-none text-sm">H Zoom:</span>
      <input
        type="range"
        min="1"
        max="20"
        value={props.horizontalZoom}
        onInput={(e) => props.onHorizontalZoom(Number(e.currentTarget.value))}
        class="range range-sm"
      />
      <span class="text-xs">{props.horizontalZoom}px/s</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex-none text-sm">V Zoom:</span>
      <select
        value={props.verticalZoom}
        onInput={(e) => props.onVerticalZoom(e.currentTarget.value)}
        class="select select-sm"
      >
        <For each={VERTICAL_ZOOM_LEVELS}>{level => (
          <option value={level.value}>{level.label}</option>
        )}</For>
      </select>
    </div>
  </div>
)

const Playhead = (props: { zoom: number }) => {
  const { state } = useAudioContext()
  let phRef !: HTMLDivElement
  let leftPosition = 0

  createEffect(() => {
    leftPosition = state.currentTime * props.zoom
    phRef.style.left = `${leftPosition}px`

    // Set height to match parent container
    if (phRef.parentElement) {
      phRef.style.height = `${phRef.parentElement.scrollHeight}px`
    }
  })

  // Add resize observer to track parent height changes
  createEffect(() => {
    if (!phRef?.parentElement) return

    const resizeObserver = new ResizeObserver(() => {
      if (phRef.parentElement) {
        phRef.style.height = `${phRef.parentElement.scrollHeight}px`
      }
    })

    resizeObserver.observe(phRef.parentElement)

    return () => resizeObserver.disconnect()
  })

  return (
    <div
      ref={phRef}
      class="absolute top-0 w-0.5 bg-red-500 pointer-events-none z-30"
    />
  )
}

const EditorApp = () => {
  const [horizontalZoom, setHorizontalZoom] = createSignal(5) // 5 pixels per second
  const [verticalZoom, setVerticalZoom] = createSignal('h-8')

  let scrollContainer!: HTMLDivElement

  const trackNumbers = () => Array.from({ length: TOTAL_TRACKS }, (_, i) => i + 1)
  const showTimeMarkers = () => verticalZoom() !== 'h-2'

  const handleHorizontalZoomChange = (newZoom: number) => {
    // Get current scroll position before zoom change
    const currentScrollLeft = scrollContainer.scrollLeft

    // Convert current pixel position to time (seconds), accounting for left margin
    const currentTime = Math.max(0, (currentScrollLeft - 32) / horizontalZoom())

    // Update zoom
    setHorizontalZoom(newZoom)

    // Recalculate pixel position with new zoom and restore scroll position
    const newScrollLeft = currentTime * newZoom + 32
    scrollContainer.scrollLeft = newScrollLeft
  }

  return (
    <div class="w-screen h-screen flex flex-col">
      <ZoomControls
        horizontalZoom={horizontalZoom()}
        verticalZoom={verticalZoom()}
        onHorizontalZoom={handleHorizontalZoomChange}
        onVerticalZoom={setVerticalZoom}
      />


      <div ref={scrollContainer} class="flex-1 overflow-y-auto relative m-4 ">

        <Markers vzoom={verticalZoom()} hzoom={horizontalZoom()} showMarkers={true} />
        <For each={trackNumbers()}>{trackNumber => (
          <Track
            trackNumber={trackNumber}
            vzoom={verticalZoom()}
            hzoom={horizontalZoom()}
            showMarkers={showTimeMarkers()}
          />
        )}</For>

        {/* Playhead */}
        <Playhead zoom={horizontalZoom()} />
      </div>
    </div>
  )
}

const root = document.getElementById('root')
render(() => (
  <AudioProvider>
    <EditorApp />
  </AudioProvider>
), root!)
