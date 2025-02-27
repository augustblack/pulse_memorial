var janus = null
var streaming = null

var server = 'wss://nyc.listen.center/ws'
var iceServers = [
  { 'urls': 'stun:stun.l.google.com:19302' },
  { 'urls': 'turn:nyc-turn.listen.center:443', 'username': 'no', 'credential': 'miras' },
  { 'urls': 'turn:nyc-turn.listen.center:443?transport=tcp', 'username': 'no', 'credential': 'miras' }
]

var stream = null

console.log('iceServers', iceServers)

function stopStream() {
  var body = { request: 'stop' }
  streaming.send({ message: body })
  streaming.hangup()
}


function init(channelId, opaqueId, audioEl, setPlayState) {
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
                var body = { request: 'watch', id: channelId }
                streaming.send({ message: body })
              },
              error: function(error) {
                Janus.error('  -- Error attaching plugin... ', error)
              },
              iceState: function(state) {
                // Janus.log("ICE state changed to " + state)
                Janus.log('ICE state changed to ' + state)
              },
              webrtcState: function(on) {
                // Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now")
                Janus.log('Janus says our WebRTC PeerConnection is ' + (on ? 'up' : 'down') + ' now')
                setPlayState(on ? 'ready' : 'disconnected')
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
                  Janus.log('Error, stopping stream...', msg)
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
                Janus.log(
                  'Remote track (mid=' + mid + ') ' +
                  (on ? 'added' : 'removed') +
                  (metadata ? ' (' + metadata.reason + ') ' : '') + ':', track
                )
                if (!on) {
                  Janus.log('setting stream to null')
                  stream = null
                }
                // If we're here, a new track was added
                // $('#spinner' + mid).remove();
                if (on && track.kind === 'audio' && stream === null) {
                  // New audio track: create a stream out of it, and use a hidden <audio> element
                  stream = new MediaStream([track])
                  // Janus.log("Created remote audio stream:", stream);
                  Janus.log('Created remote audio stream')
                  if (audioEl) {
                    try {
                      audioEl.srcObject = stream
                    } catch (e) {
                      try {
                        audioEl.src = URL.createObjectURL(stream)
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


