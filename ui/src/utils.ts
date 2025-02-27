const key = {
  fullscreenEnabled: 0,
  fullscreenElement: 1,
  requestFullscreen: 2,
  exitFullscreen: 3,
  fullscreenchange: 4,
  fullscreenerror: 5,
}

const webkit = [
  'webkitFullscreenEnabled',
  'webkitFullscreenElement',
  'webkitRequestFullscreen',
  'webkitExitFullscreen',
  'webkitfullscreenchange',
  'webkitfullscreenerror',
]

const moz = [
  'mozFullScreenEnabled',
  'mozFullScreenElement',
  'mozRequestFullScreen',
  'mozCancelFullScreen',
  'mozfullscreenchange',
  'mozfullscreenerror',
]

const ms = [
  'msFullscreenEnabled',
  'msFullscreenElement',
  'msRequestFullscreen',
  'msExitFullscreen',
  'MSFullscreenChange',
  'MSFullscreenError',
]
const vendor = (
  ('fullscreenEnabled' in document && Object.keys(key)) ||
  (webkit[0] in document && webkit) ||
  (moz[0] in document && moz) ||
  (ms[0] in document && ms) ||
  []
)
export const requestFs = () =>
  (vendor.length && document.documentElement && vendor[key.requestFullscreen] in document.documentElement)
    // @ts-ignore
    ? document.documentElement[vendor[key.requestFullscreen]]()
    : null

export const exitFs = () => vendor.length > 0
  // @ts-ignore
  ? document[vendor[key.exitFullscreen]]()
  : null
export const hasFs = () => vendor.length > 0
  // @ts-ignore
  ? document[vendor[key.fullscreenEnabled]]
  : false

// @ts-ignore
export const isFsEnabled = () => vendor.length > 0 && document[vendor[key.fullscreenElement]] !== null

export const setOnFsChange = (handler: () => void) => document.addEventListener(vendor[key.fullscreenchange], handler)
export const rmOnFsChange = (handler: () => void) => document.removeEventListener(vendor[key.fullscreenchange], handler)
export const hasFS = () => vendor.length > 0


