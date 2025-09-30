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

type EditorState = {
  horizontalZoom: number
  verticalZoom: string
  playheadPosition: number
  isPlaying: boolean
}

const AudioClipComponent = (props: { clip: AudioClip, zoom: number }) => (
  <div
    class="absolute top-1 rounded px-1 text-xs text-white font-medium pointer-events-auto cursor-move"
    style={{
      left: `${props.clip.startTime * props.zoom}px`,
      width: `${props.clip.duration * props.zoom}px`,
      'background-color': props.clip.color,
      'min-width': '20px',
      height: 'calc(100% - 8px)'
    }}
    title={`${props.clip.name} (${props.clip.duration.toFixed(1)}s)`}
  >
    {props.clip.name}
  </div>
)

const Track = (props: { trackNumber: number, height: string, zoom: number, showMarkers?: boolean }) => {
  const { state } = useAudioContext()

  // Get clips for this track
  const trackClips = () => state.clips.filter(clip => clip.trackIndex === props.trackNumber - 1)
  const timeMarkers = () => {
    const markers = []
    const pixelsPerSecond = props.zoom

    // Odd tracks: 0, 10, 20, 30 minutes
    // Even tracks: 5, 15, 25, 35 minutes
    const isOddTrack = props.trackNumber % 2 === 1
    const startOffsetMinutes = isOddTrack ? 0 : 5

    // Mark every 10 minutes starting from the offset (include 3:00:00 endpoint)
    for (let minutes = startOffsetMinutes; minutes <= 180; minutes += 10) {
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
    <div class={` ${props.height} relative`} style={{ 'min-width': `${TIMELINE_SECONDS * props.zoom + 32}px` }}>

      {/* Track content area with original background */}
      <div
        class="bg-base-100 h-full relative m-0 ml-4 mr-8 p-0"
        style={{ width: `${TIMELINE_SECONDS * props.zoom}px` }}
      >
        {props.showMarkers ? (
          <For each={timeMarkers()}>{marker => (
            <div
              class="absolute text-xs pointer-events-none top-0"
              style={{ left: `${marker.x}px` }}
            >
              <div class="w-px bg-base-content/40 h-4"></div>
              <span
                class="absolute text-base-content/60 px-1 whitespace-nowrap top-0"
                style={{ left: '4px' }}
              >
                {marker.label}
              </span>
            </div>
          )}</For>
        ) : null}

        {/* Audio clips */}
        <For each={trackClips()}>{clip => (
          <AudioClipComponent clip={clip} zoom={props.zoom} />
        )}</For>
      </div>

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

  let leftPosition = state.currentTime * props.zoom + 16 // 16px offset to match track ml-4 margin

  createEffect(() => {
    leftPosition = state.currentTime * props.zoom + 16 // 16px offset to match track ml-4 margin
  })

  console.log('Playhead position:', {
    currentTime: state.currentTime,
    zoom: props.zoom,
    leftPosition: leftPosition
  })

  return (
    <div
      class="absolute top-0 w-0.5 bg-red-500 pointer-events-none z-30"
      style={{
        left: `${leftPosition}px`,
        height: '100%'
      }}
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

      <div ref={scrollContainer} class="flex-1 overflow-auto">
        <div
          class="relative flex flex-col gap-1"
          style={{ width: `${TIMELINE_SECONDS * horizontalZoom() + 32}px` }}
        >
          <For each={trackNumbers()}>{trackNumber => (
            <Track
              trackNumber={trackNumber}
              height={verticalZoom()}
              zoom={horizontalZoom()}
              showMarkers={showTimeMarkers()}
            />
          )}</For>

          {/* Playhead */}
          <Playhead zoom={horizontalZoom()} />
        </div>
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
