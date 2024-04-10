/* global iceServers:readonly, Janus:readonly, server:readonly */

var janus = null
var streaming = null
var opaqueId = "streamingtest-" + Janus.randomString(12)

var remoteTracks = {}

var streamsList = {}
var selectedStream = null

var server = 'wss://pulse.listen.center/ws'
var iceServers = null


let wakeLock = null
function toggleFullScreen() {
	if (!document.fullscreenElement) {
		document.documentElement.requestFullscreen()
		if ("wakeLock" in navigator) {
			navigator.wakeLock.request("screen")
				.then(wl => {
					wakeLock = wl
				})
				.catch(console.warn)
		}
	} else if (document.exitFullscreen) {
		document.exitFullscreen()
		wakeLock.release().then(() => {
			wakeLock = null
		})
	}
}


function init(id) {
	toggleFullScreen()
	if (!Janus || !Janus.isWebrtcSupported()) {
		window.alert("No WebRTC support... ")
		return;
	}

	// Initialize the library (all console debuggers enabled)
	Janus.init({
		debug: "all", callback: function() {
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
								let body = { request: "watch", id }
								streaming.send({ message: body })
							},
							error: function(error) {
								Janus.error("  -- Error attaching plugin... ", error);
							},
							iceState: function(state) {
								Janus.log("ICE state changed to " + state);
							},
							webrtcState: function(on) {
								Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
							},
							slowLink: function(uplink, lost, mid) {
								Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
									" packets on mid " + mid + " (" + lost + " lost packets)");
							},
							onmessage: function(msg, jsep) {
								Janus.debug(" ::: Got a message :::", msg)
								let result = msg["result"]
								if (result) {
									if (result["status"]) {
										let status = result["status"]
										if (status === 'starting')
											Janus.log("Starting, please wait...")
										else if (status === 'started')
											Janus.log("Started")
										else if (status === 'stopped')
											stopStream()
									} else if (msg["streaming"] === "event") {
										// Does this event refer to a mid in particular?
										let mid = result["mid"] ? result["mid"] : "0";
										// Is simulcast in place?
										let substream = result["substream"];
										let temporal = result["temporal"];
										if ((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
										}
										// Is VP9/SVC in place?
										let spatial = result["spatial_layer"];
										temporal = result["temporal_layer"];
									}
								} else if (msg["error"]) {
									Janus.log("Error, stopping stream...")
									stopStream()
									return
								}
								if (jsep) {
									Janus.log("Handling SDP as well...", jsep)
									let stereo = true // (jsep.sdp.indexOf("stereo=1") !== -1)
									Janus.log("Got stereo? " + stereo)
									// Offer from the plugin, let's answer
									streaming.createAnswer(
										{
											jsep: jsep,
											// We only specify data channels here, as this way in
											// case they were offered we'll enable them. Since we
											// don't mention audio or video tracks, we autoaccept them
											// as recvonly (since we won't capture anything ourselves)
											tracks: [
												{ type: 'data' }
											],
											customizeSdp: function(jsep) {
												if (stereo && jsep.sdp.indexOf("stereo=1") == -1) {
													// Make sure that our offer contains stereo too
													jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1");
													console.log('modifying for stereo!', jsep)
												}
											},
											success: function(jsep) {
												Janus.log("Got SDP!", jsep)
												let body = { request: "start" };
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
								Janus.debug(
									"Remote track (mid=" + mid + ") " +
									(on ? "added" : "removed") +
									(metadata ? " (" + metadata.reason + ") " : "") + ":", track
								);
								let mstreamId = "mstream" + mid;
								if (streamsList[selectedStream] && streamsList[selectedStream].legacy)
									mstreamId = "mstream0";
								if (!on) {
									if (track.kind === "video") {
									}
									delete remoteTracks[mid];
									return;
								}
								// If we're here, a new track was added
								// $('#spinner' + mid).remove();
								let stream = null;
								if (track.kind === "audio") {
									// New audio track: create a stream out of it, and use a hidden <audio> element
									stream = new MediaStream([track]);
									remoteTracks[mid] = stream;
									Janus.log("Created remote audio stream:", stream);
								} else {
									Janus.log("Got video, but should not have.", stream);
								}
								// Play the stream when we get a playing event
								Janus.attachMediaStream(document.getElementById('audio'), stream);
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
	let body = { request: "info", id: 1 }
	streaming.send({
		message: body, success: function(result) {
			if (result && result.info && result.info.metadata) {
				Janus.log(escapeXmlTags(result.info.metadata))
			}
		}
	})
}

function stopStream() {
	let body = { request: "stop" };
	streaming.send({ message: body });
	streaming.hangup();
}

// Helper to escape XML tags
function escapeXmlTags(value) {
	if (value) {
		let escapedValue = value.replace(new RegExp('<', 'g'), '&lt');
		escapedValue = escapedValue.replace(new RegExp('>', 'g'), '&gt');
		return escapedValue;
	}
}

