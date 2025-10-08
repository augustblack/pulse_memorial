import { createContext, useContext, ParentProps, onMount, onCleanup, createEffect } from "solid-js"
import { createStore, SetStoreFunction } from "solid-js/store"

export type AudioClip = {
  id: string
  audioBuffer: AudioBuffer
  startTime: number    // seconds in timeline
  duration: number     // clip duration in seconds
  trackIndex: number   // 0-48 (tracks 1-49)
  color: string        // display color
  name: string         // clip name/type
}

export type AudioState = {
  audioContext: AudioContext | null
  clips: AudioClip[]
  isPlaying: boolean
  currentTime: number
  playStartTime: number  // when playback started (audioContext.currentTime)
  timelineStartTime: number  // timeline position when playback started
  activeSourceNodes: Map<string, AudioBufferSourceNode>  // currently playing sources
}

interface AudioContextType {
  state: AudioState
  setState: SetStoreFunction<AudioState>
}

const AudioContextProvider = createContext<AudioContextType>()

export const useAudioContext = () => {
  const context = useContext(AudioContextProvider)
  if (!context) throw new Error("useAudioContext must be used within AudioProvider")
  return context
}

// Audio generation utilities
export const generateWhiteNoise = (audioContext: AudioContext, duration: number): AudioBuffer => {
  const sampleRate = audioContext.sampleRate
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() - 0.5) * 0.3 // Reduce volume
  }

  return buffer
}

export const generateSineWave = (audioContext: AudioContext, frequency: number, duration: number): AudioBuffer => {
  const sampleRate = audioContext.sampleRate
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3 // Reduce volume
  }

  return buffer
}

export const generateTriangleWave = (audioContext: AudioContext, frequency: number, duration: number): AudioBuffer => {
  const sampleRate = audioContext.sampleRate
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate
    const phase = (frequency * t) % 1
    data[i] = (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase) * 0.3 // Reduce volume
  }

  return buffer
}

// Generate random duration between min and max seconds
export const randomDuration = (min: number, max: number): number => {
  return Math.random() * (max - min) + min
}

// Generate test clips
export const generateTestClips = (audioContext: AudioContext): AudioClip[] => {
  const clips: AudioClip[] = []
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7']

  // Generate 5 test clips
  const testTypes = [
    { name: 'White Noise', generator: () => generateWhiteNoise(audioContext, randomDuration(5, 20)) },
    { name: '220Hz Sine', generator: () => generateSineWave(audioContext, 220, randomDuration(5, 20)) },
    { name: '220Hz Triangle', generator: () => generateTriangleWave(audioContext, 220, randomDuration(5, 20)) },
    { name: '440Hz Sine', generator: () => generateSineWave(audioContext, 440, randomDuration(5, 20)) },
    { name: '440Hz Triangle', generator: () => generateTriangleWave(audioContext, 440, randomDuration(5, 20)) }
  ]

  testTypes.forEach((testType, index) => {
    const audioBuffer = testType.generator()
    clips.push({
      id: `test-${index}`,
      audioBuffer,
      startTime: Math.random() * 10, // Random start time 0-10 seconds
      duration: audioBuffer.duration,
      trackIndex: index, // Tracks 0-4 (displayed as 1-5)
      color: colors[index],
      name: testType.name
    })
  })

  return clips
}

// Playback utilities
export const playClip = (audioContext: AudioContext, clip: AudioClip, when: number) => {
  const source = audioContext.createBufferSource()
  source.buffer = clip.audioBuffer
  source.connect(audioContext.destination)
  source.start(when)
  return source
}

export const stopAllSources = (activeSourceNodes: Map<string, AudioBufferSourceNode>) => {
  activeSourceNodes.forEach(source => {
    try {
      source.stop()
    } catch (e) {
      // Source may already be stopped
    }
  })
  activeSourceNodes.clear()
}

export const AudioProvider = (props: ParentProps) => {
  const [state, setState] = createStore<AudioState>({
    audioContext: null,
    clips: [],
    isPlaying: false,
    currentTime: 0,
    playStartTime: 0,
    timelineStartTime: 0,
    activeSourceNodes: new Map()
  })

  let animationFrameId: number

  // Store playback state outside of reactive system to avoid loops
  let playbackState = {
    isPlaying: false,
    startTime: 0,
    timelineStart: 0
  }

  const updateCurrentTime = () => {
    if (!playbackState.isPlaying || !state.audioContext) return

    const elapsed = state.audioContext.currentTime - playbackState.startTime
    const newCurrentTime = playbackState.timelineStart + elapsed

    // Debug every 60 frames (roughly once per second)
    if (Math.floor(newCurrentTime * 60) % 60 === 0) {
      console.log('Playback update:', {
        elapsed,
        newCurrentTime,
        audioContextTime: state.audioContext.currentTime,
        activeClips: state.activeSourceNodes.size
      })
    }
    setState('currentTime', newCurrentTime)

    // Schedule clips that should start playing
    // Add a small look-ahead buffer (100ms) to account for scheduling latency
    const lookAhead = 0.1
    state.clips.forEach(clip => {
      const clipId = `${clip.id}-${clip.startTime}`
      if (newCurrentTime >= (clip.startTime - lookAhead) &&
        newCurrentTime < clip.startTime + clip.duration &&
        !state.activeSourceNodes.has(clipId)) {

        console.log('Starting clip:', clip.name, 'scheduled for:', clip.startTime, 'current time:', newCurrentTime)

        // Schedule the clip to start at its exact timeline position
        const when = state.audioContext!.currentTime + (clip.startTime - newCurrentTime)

        // Only schedule if the start time is in the future or very recent past
        if (when >= state.audioContext!.currentTime - 0.1) {
          const source = playClip(state.audioContext!, clip, Math.max(when, state.audioContext!.currentTime))

          setState('activeSourceNodes', prev => new Map(prev.set(clipId, source)))

          // Remove source when it finishes
          source.onended = () => {
            console.log('Clip ended:', clip.name)
            setState('activeSourceNodes', prev => {
              const newMap = new Map(prev)
              newMap.delete(clipId)
              return newMap
            })
          }
        }
      }
    })

    if (playbackState.isPlaying) {
      animationFrameId = requestAnimationFrame(updateCurrentTime)
    }
  }

  // Only react to isPlaying changes, not other state changes
  createEffect(() => {
    if (state.isPlaying !== playbackState.isPlaying) {
      console.log('Playback state change:', state.isPlaying)
      playbackState.isPlaying = state.isPlaying

      if (state.isPlaying) {
        playbackState.startTime = state.audioContext?.currentTime || 0
        playbackState.timelineStart = state.currentTime
        console.log('Starting playback:', {
          startTime: playbackState.startTime,
          timelineStart: playbackState.timelineStart,
          clips: state.clips.length
        })
        animationFrameId = requestAnimationFrame(updateCurrentTime)
      } else {
        console.log('Stopping playback')
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId)
        }
        stopAllSources(state.activeSourceNodes)
        setState('activeSourceNodes', new Map())
      }
    }
  })

  onMount(() => {
    // Initialize Web Audio API context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

    // Generate test clips
    const testClips = generateTestClips(audioContext)

    setState({
      audioContext,
      clips: testClips
    })
  })

  onCleanup(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }
    stopAllSources(state.activeSourceNodes)
  })

  const contextValue = { state, setState }

  return (
    <AudioContextProvider.Provider value={contextValue}>
      {props.children}
    </AudioContextProvider.Provider>
  )
}
