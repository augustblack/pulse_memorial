var janus = null
var streaming = null
var opaqueId = 'pulse-' + Janus.randomString(12)

var server = 'wss://nyc.listen.center/ws'
var iceServers = [
	{ 'urls': 'stun:stun.l.google.com:19302' },
	{ 'urls': 'turn:nyc-turn.listen.center:443', 'username': 'no', 'credential': 'miras' },
	{ 'urls': 'turn:nyc-turn.listen.center:443?transport=tcp', 'username': 'no', 'credential': 'miras' }
]

var stream = null

console.log('iceServers', iceServers)

function playAudio() {
	var a = document.getElementById('audio')
	if (a && a.readyState >= 3 && a.paused === true) {
		toggleFullScreen()
		a.play()
			.then(() => {
				var playButton = document.getElementById('playButton')
				if (playButton) {
					playButton.classList.add('pulsingButton')
					playButton.innerHTML = ''
				}
			})
			.catch(console.error)
	}
}

let wakeLock = null
function toggleFullScreen() {
	if (!document.fullscreenElement) {
		if ('documentElement' in document && 'requestFullscreen' in document.documentElement) {
			document.documentElement.requestFullscreen()
			if ('wakeLock' in navigator) {
				navigator.wakeLock.request('screen')
					.then(wl => {
						wakeLock = wl
					})
					.catch(console.warn)
			}
		}
	} else if (document.exitFullscreen) {
		if ('exitFullscreen' in document) {
			document.exitFullscreen()
			if (wakeLock) {
				wakeLock.release().then(() => {
					wakeLock = null
				})
			}
		}
	}
}

function logLocal(msg) {
	console.log(msg)
	// var logdiv = document.getElementById('log')
	// logdiv.innerHTML += `<div>${msg}</div>`
}
function errLocal(msg) {
	var logdiv = document.getElementById('log')
	logdiv.innerHTML += `<div style="color:red;">${msg}</div>`
}



function init(id) {
	if (!Janus || !Janus.isWebrtcSupported()) {
		window.alert('No WebRTC support... ')
		return
	}

	// Initialize the library (all console debuggers enabled)
	Janus.init({
		debug: 'all',
		callback: function() {
			janus = new Janus(
				{
					server: server,
					iceServers: iceServers,
					success: function() {
						janus.attach({
							plugin: 'janus.plugin.streaming',
							opaqueId: opaqueId,
							success: function(pluginHandle) {
								streaming = pluginHandle
								Janus.log('Plugin attached! (' + streaming.getPlugin() + ', id=' + streaming.getId() + ')')
								var body = { request: 'watch', id }
								streaming.send({ message: body })
							},
							error: function(error) {
								Janus.error('  -- Error attaching plugin... ', error)
							},
							iceState: function(state) {
								// Janus.log("ICE state changed to " + state)
								logLocal('ICE state changed to ' + state)
							},
							webrtcState: function(on) {
								// Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now")
								logLocal('Janus says our WebRTC PeerConnection is ' + (on ? 'up' : 'down') + ' now')
								var playButton = document.getElementById('playButton')
								if (playButton) {
									if (on) {
										playButton.innerHTML = 'play'
										playButton.addEventListener('click', playAudio)
									} else {
										playButton.classList.remove('pulsingButton')
										playButton.removeEventListener('click', playAudio)
									}
								}
							},
							slowLink: function(uplink, lost, mid) {
								Janus.warn('Janus reports problems ' + (uplink ? 'sending' : 'receiving') +
									' packets on mid ' + mid + ' (' + lost + ' lost packets)')
							},
							onmessage: function(msg, jsep) {
								Janus.debug(' ::: Got a message :::', msg)
								var result = msg['result']
								if (result) {
									if (result['status']) {
										var status = result['status']
										if (status === 'starting') { Janus.log('Starting, please wait...') }
										else if (status === 'started') { Janus.log('Started') }
										else if (status === 'stopped') { stopStream() }
									} else if (msg['streaming'] === 'event') {
										// no need to do anything
									}
								} else if (msg['error']) {
									Janus.log('Error, stopping stream...')
									stopStream()
									return
								}
								if (jsep) {
									Janus.log('Handling SDP as well...', jsep)
									var stereo = true // (jsep.sdp.indexOf("stereo=1") !== -1)
									Janus.log('Got stereo? ' + stereo)
									// Offer from the plugin, let's answer
									streaming.createAnswer(
										{
											jsep: jsep,
											// We only specify data channels here, as this way in
											// case they were offered we'll enable them. Since we
											// don't mention audio or video tracks, we autoaccept them
											// as recvonly (since we won't capture anything ourselves)
											// tracks: [
											//		{ type: 'data' }
											//	],
											customizeSdp: function(jsep) {
												if (stereo && jsep.sdp.indexOf('stereo=1') == -1) {
													// Make sure that our offer contains stereo too
													jsep.sdp = jsep.sdp.replace('useinbandfec=1', 'useinbandfec=1;stereo=1')
													console.log('modifying for stereo!', jsep)
												}
											},
											success: function(jsep) {
												Janus.log('Got SDP!', jsep)
												var body = { request: 'start' }
												streaming.send({ message: body, jsep: jsep })
												Janus.log('sending jsep')
											},
											error: function(error) {
												Janus.error('WebRTC error:', error)
											}
										})
								}
							},
							onremotetrack: function(track, mid, on, metadata) {
								logLocal(
									'Remote track (mid=' + mid + ') ' +
									(on ? 'added' : 'removed') +
									(metadata ? ' (' + metadata.reason + ') ' : '') + ':', track
								)
								if (!on) {
									logLocal('setting stream to null')
									stream = null
								}
								// If we're here, a new track was added
								// $('#spinner' + mid).remove();
								if (on && track.kind === 'audio' && stream === null) {
									// New audio track: create a stream out of it, and use a hidden <audio> element
									stream = new MediaStream([track])
									// Janus.log("Created remote audio stream:", stream);
									logLocal('Created remote audio stream')
									var a = document.getElementById('audio')
									if (a) {
										try {
											a.srcObject = stream
										} catch (e) {
											try {
												a.src = URL.createObjectURL(stream)
											} catch (e) {
												Janus.error('Error attaching stream to element', e)
											}
										}
									}
								} else {
									Janus.log('Got video, but should not have.', stream)
								}
							},
							ondataopen: function(label, protocol) {
								Janus.log('The DataChannel is available!')
							},
							ondata: function(data) {
								Janus.log('We got data from the DataChannel!', data)
							},
							oncleanup: function() {
								Janus.log(' ::: Got a cleanup notification :::')
							}
						})
					},
					error: function(error) {
						Janus.log('got main error', error)
					},
					destroyed: function() {
						window.location.reload()
					}
				})
		}
	})
}


function stopStream() {
	var body = { request: 'stop' }
	streaming.send({ message: body })
	streaming.hangup()
}
let ws

function websocket(url) {
	console.log('url', url)
	ws = new WebSocket(url)

	if (!ws) {
		throw new Error('server didn\'t accept ws')
	}

	ws.addEventListener('open', () => {
		console.log('Opened websocket')
	})

	ws.addEventListener('message', ({ data }) => {
		try {
			var msg = JSON.parse(data)
			console.log('msg', msg)
			if ('streamId' in msg) {
				logLocal('streamId:' + msg.streamId)
				var playButton = document.getElementById('playButton')
				if (playButton) {
					init(msg.streamId)
				}
			}
			if ('participantCount' in msg) {
				var pc = document.getElementById('participantCount')
				if (pc) {
					pc.innerHTML = msg.participantCount
				}
			}
		} catch (error) {
			console.log('msg decode error:', error)
		}
	})

	ws.addEventListener('close', () => {
		console.log('Closed websocket')
	})

	ws.addEventListener('close', () => {
		console.log('Closed websocket')
	})
}

var url = new URL(window.location)
url.protocol = url.protocol === 'https:' ? 'wss' : 'ws'
url.pathname = `/ws/8/${opaqueId}`
console.log('url', url.href)
websocket(url.href)

function setButton() {
	var playButton = document.getElementById('playButton')
	if (playButton) {
		playButton.style.width = window.innerHeight * 0.4 + 'px'
		playButton.style.height = window.innerHeight * 0.4 + 'px'
		playButton.style.fontSize = window.innerHeight * 0.1 + 'px'
	}
}

window.addEventListener('resize', setButton)
setButton()

/*
checkTURNServer({
	urls: 'turn:nyc-turn.listen.center:443?transport=tcp',
	'username': 'no',
	'credential': 'miras'
}).then(function(bool) {
	console.log('is TURN server active? ', bool ? 'yes' : 'no')
}).catch(console.error)
*/
