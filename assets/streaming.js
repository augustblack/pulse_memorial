var janus = null
var streaming = null
var opaqueId = "streamingtest-" + Janus.randomString(12)

var server = 'wss://pulse.listen.center/ws'
var iceServers = [
	{ "urls": "stun:stun.l.google.com:19302" },
	{ "urls": "turn:nyc-turn.listen.center:443", "username": "no", "credential": "miras" },
	{ "urls": "turn:nyc-turn.listen.center:443?transport=tcp", "username": "no", "credential": "miras" }
]
function checkTURNServer(turnConfig, timeout) {

	return new Promise(function(resolve, reject) {

		setTimeout(function() {
			if (promiseResolved) return
			resolve(false);
			promiseResolved = true;
			console.log('wtf timeout')
		}, timeout || 5000);

		var promiseResolved = false
			, myPeerConnection = window.RTCPeerConnection
			, pc = new myPeerConnection({ iceServers: [turnConfig] })
		pc.createDataChannel("")   //create a bogus data channel
		pc.createOffer()
			.then((sdp) => {
				if (sdp.sdp.indexOf('typ relay') > -1) { // sometimes sdp contains the ice candidates...
					console.log('wtf')
					promiseResolved = true
					resolve(true)
				}
				return pc.setLocalDescription(sdp)
			})    // create offer and set local description
			.catch(reject)
		pc.onicecandidate = function(ice) {  //listen for candidate events
			if (promiseResolved || !ice || !ice.candidate || !ice.candidate.candidate || !(ice.candidate.candidate.indexOf('typ relay') > -1)) return
			promiseResolved = true
			console.log('wtf ice candidadte', ice)
			resolve(true)
		}
	})
}

var stream = null

console.log('iceServers', iceServers)

let wakeLock = null
function toggleFullScreen() {
	if (!document.fullscreenElement) {
		if ("documentElement" in document && "requestFullscreen" in document.documentElement) {
			document.documentElement.requestFullscreen()
			if ("wakeLock" in navigator) {
				navigator.wakeLock.request("screen")
					.then(wl => {
						wakeLock = wl
					})
					.catch(console.warn)
			}
		}
	} else if (document.exitFullscreen) {
		if ("exitFullscreen" in document) {
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
	var logdiv = document.getElementById('log')
	logdiv.innerHTML += `<div>${msg}</div>`
}
function errLocal(msg) {
	var logdiv = document.getElementById('log')
	logdiv.innerHTML += `<div style="color:red;">${msg}</div>`
}



function init(id) {
	toggleFullScreen()
	if (!Janus || !Janus.isWebrtcSupported()) {
		window.alert("No WebRTC support... ")
		return;
	}

	// Initialize the library (all console debuggers enabled)
	Janus.init({
		debug: "all",
		callback: function() {
			janus = new Janus(
				{
					server: server,
					iceServers: iceServers,
					success: function() {
						janus.attach({
							plugin: "janus.plugin.streaming",
							opaqueId: opaqueId,
							success: function(pluginHandle) {
								streaming = pluginHandle
								Janus.log("Plugin attached! (" + streaming.getPlugin() + ", id=" + streaming.getId() + ")")
								var body = { request: "watch", id }
								streaming.send({ message: body })
							},
							error: function(error) {
								Janus.error("  -- Error attaching plugin... ", error);
							},
							iceState: function(state) {
								// Janus.log("ICE state changed to " + state)
								logLocal("ICE state changed to " + state)
							},
							webrtcState: function(on) {
								// Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now")
								logLocal("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now")
								if (on === 'up') {

								}
							},
							slowLink: function(uplink, lost, mid) {
								Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
									" packets on mid " + mid + " (" + lost + " lost packets)");
							},
							onmessage: function(msg, jsep) {
								Janus.debug(" ::: Got a message :::", msg)
								var result = msg["result"]
								if (result) {
									if (result["status"]) {
										var status = result["status"]
										if (status === 'starting')
											Janus.log("Starting, please wait...")
										else if (status === 'started')
											Janus.log("Started")
										else if (status === 'stopped')
											stopStream()
									} else if (msg["streaming"] === "event") {
										// no need to do anything
									}
								} else if (msg["error"]) {
									Janus.log("Error, stopping stream...")
									stopStream()
									return
								}
								if (jsep) {
									Janus.log("Handling SDP as well...", jsep)
									var stereo = true // (jsep.sdp.indexOf("stereo=1") !== -1)
									Janus.log("Got stereo? " + stereo)
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
												if (stereo && jsep.sdp.indexOf("stereo=1") == -1) {
													// Make sure that our offer contains stereo too
													jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1");
													console.log('modifying for stereo!', jsep)
												}
											},
											success: function(jsep) {
												Janus.log("Got SDP!", jsep)
												var body = { request: "start" };
												streaming.send({ message: body, jsep: jsep });
												Janus.log("sending jsep")
											},
											error: function(error) {
												Janus.error("WebRTC error:", error);
											}
										});
								}
							},
							onremotetrack: function(track, mid, on, metadata) {
								logLocal(
									"Remote track (mid=" + mid + ") " +
									(on ? "added" : "removed") +
									(metadata ? " (" + metadata.reason + ") " : "") + ":", track
								)
								if (!on) {
									logLocal('setting stream to null')
									stream = null
								}
								// If we're here, a new track was added
								// $('#spinner' + mid).remove();
								if (on && track.kind === "audio" && stream === null) {
									// New audio track: create a stream out of it, and use a hidden <audio> element
									stream = new MediaStream([track])
									// Janus.log("Created remote audio stream:", stream);
									logLocal("Created remote audio stream")
									var a = document.getElementById('audio')

									if (a) {
										a.style.display = 'block'
										a.style.visibility = 'visible'

										try {
											a.srcObject = stream
											a.play()
												.then(() => logLocal("Created remote audio stream"))
												.catch(e => errLocal(e))
										} catch (e) {
											try {
												alert('cannot set srcObject')
												a.src = URL.createObjectURL(stream)
											} catch (e) {
												Janus.error("Error attaching stream to element", e)
											}
										}
									} else {
										alert('No audio element')
									}

								} else {
									Janus.log("Got video, but should not have.", stream);
								}
							},
							ondataopen: function(label, protocol) {
								Janus.log("The DataChannel is available!");
							},
							ondata: function(data) {
								Janus.log("We got data from the DataChannel!", data);
							},
							oncleanup: function() {
								Janus.log(" ::: Got a cleanup notification :::");
							}
						})
					},
					error: function(error) {
						Janus.log("got main error", error);
					},
					destroyed: function() {
						window.location.reload();
					}
				})
		}
	})
}


function getStreamInfo() {
	var body = { request: "info", id: 1 }
	streaming.send({
		message: body, success: function(result) {
			if (result && result.info && result.info.metadata) {
				Janus.log(escapeXmlTags(result.info.metadata))
			}
		}
	})
}

function stopStream() {
	var body = { request: "stop" };
	streaming.send({ message: body });
	streaming.hangup();
}

// Helper to escape XML tags
function escapeXmlTags(value) {
	if (value) {
		var escapedValue = value.replace(new RegExp('<', 'g'), '&lt');
		escapedValue = escapedValue.replace(new RegExp('>', 'g'), '&gt');
		return escapedValue;
	}
}

checkTURNServer({
	urls: "turn:nyc-turn.listen.center:443?transport=tcp",
	"username": "no",
	"credential": "miras"
}).then(function(bool) {
	console.log('is TURN server active? ', bool ? 'yes' : 'no');
}).catch(console.error)

