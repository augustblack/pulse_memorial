import { createContext, useContext } from "solid-js"
import { MediaRecorder, IMediaRecorder } from 'extendable-media-recorder'
import { createStore, SetStoreFunction } from 'solid-js/store'

export type R2UploadedPart = {
  partNumber: number,
  etag: string
}

export type UpItem = {
  blob: Blob | File
  key: string
  objUrl?: string
  ups: Array<number>
  isUploaded: boolean
  upParts?: Array<R2UploadedPart>
}

export type UpStore = {
  isRecording: boolean
  recordings: Record<string, UpItem>
  files: Record<string, UpItem>
  ctx: AudioContext
  vol: GainNode
  micSource?: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  compressor: DynamicsCompressorNode
  limiter: DynamicsCompressorNode
  dest: MediaStreamAudioDestinationNode
  recorder: IMediaRecorder
}

interface UpStoreContext {
  store: UpStore
  setStore: SetStoreFunction<UpStoreContext['store']>
}

export type SetUploadStore = SetStoreFunction<UpStoreContext['store']>
export const UploadContext = createContext<UpStoreContext>()
export const useUploadContext = () => {
  const context = useContext(UploadContext)
  if (!context) throw new Error("UploadContext is not valid")
  return context
}

export const UploadProvider = (props: { children: any }) => {
  const ctx = new AudioContext()
  // let micSource: MediaStreamAudioSourceNode
  const vol = ctx.createGain()
  const analyser = ctx.createAnalyser()
  const compressor = ctx.createDynamicsCompressor()
  const limiter = ctx.createDynamicsCompressor()

  analyser.fftSize = 2048
  compressor.threshold.value = -30.0  //  less intene for vocal
  compressor.knee.value = 15.0 // between 6-20 (somewhere in this range) ,
  compressor.ratio.value = 7.0 // max compression
  compressor.attack.value = 0.003 // 3ms attack
  compressor.release.value = 0.030

  limiter.threshold.value = -1.0 // this is the pitfall, leave some headroom
  limiter.knee.value = 4.0 // 3-6 range 
  limiter.ratio.value = 12.0 // 10-15 range 
  limiter.attack.value = 0.007 // 5-10ms attack
  limiter.release.value = 0.050

  const dest = ctx.createMediaStreamDestination()
  const recorder = new MediaRecorder(dest.stream, { audioBitsPerSecond: 192000 })

  const [store, setStore] = createStore<UpStore>({
    isRecording: false,
    recordings: {},
    files: {},
    ctx,
    vol,
    analyser,
    compressor,
    limiter,
    dest,
    recorder
  })
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

  return (
    <UploadContext.Provider value={{ store, setStore }}>{props.children}</UploadContext.Provider>
  )
}

