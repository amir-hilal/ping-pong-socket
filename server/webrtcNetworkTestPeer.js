const { RTCPeerConnection, RTCIceCandidate } = require('werift');

/**
 * Get ICE server configuration
 * Using Google's public STUN server for now
 * Can be extended to include TURN servers with credentials
 */
function getIceConfig() {
  return {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ],
  };
}

/**
 * Creates a WebRTC peer connection for network quality testing
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.onLog - Callback for logging (message) => void
 * @param {Function} options.onAnswer - Callback when answer is ready (sdp) => void
 * @param {Function} options.onIceCandidate - Callback for ICE candidates (candidate) => void
 * @param {Function} options.onConnectionStateChange - Callback for connection state changes (state) => void
 * @returns {Object} Peer interface with handleOffer, addIceCandidate, and close methods
 */
// webrtcNetworkTestPeer.js
const { RTCPeerConnection, RTCIceCandidate } = require('werift');

function getIceConfig() {
  return {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ],
  };
}

function createNetworkTestPeer({
  onLog = () => {},
  onAnswer = () => {},
  onIceCandidate = () => {},
  onConnectionStateChange = () => {},
} = {}) {
  const pc = new RTCPeerConnection(getIceConfig());
  let dataChannel = null;
  let isClosed = false;

  onLog('WebRTC peer connection created');

  pc.onIceCandidate.subscribe((candidate) => {
    if (!candidate) return;
    const candidateInit = candidate.toJSON();
    onLog('ICE candidate generated');
    onIceCandidate(candidateInit);
  });

  pc.connectionStateChange.subscribe(() => {
    const state = pc.connectionState;
    onLog(`Connection state changed to: ${state}`);
    onConnectionStateChange(state);
    if (state === 'failed' || state === 'closed') {
      cleanup();
    }
  });

  pc.iceConnectionStateChange.subscribe(() => {
    onLog(`ICE connection state: ${pc.iceConnectionState}`);
  });

  // browser creates the dc, we just accept it
  pc.onDataChannel.subscribe((channel) => {
    dataChannel = channel;
    onLog(`Data channel received: ${channel.label}`);

    channel.onOpen.subscribe(() => {
      onLog(`Data channel opened: ${channel.label}`);
    });

    channel.onClose.subscribe(() => {
      onLog(`Data channel closed: ${channel.label}`);
      dataChannel = null;
    });

    channel.onError.subscribe((err) => {
      onLog(`Data channel error: ${err}`);
    });

    channel.onMessage.subscribe((data) => {
      try {
        const str =
          typeof data === 'string' ? data : new TextDecoder().decode(data);
        const msg = JSON.parse(str);
        if (msg.type === 'ping') {
          const pong = { type: 'pong', timestamp: msg.timestamp };
          if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(pong));
            onLog(`Ping received (timestamp=${msg.timestamp}), pong sent`);
          }
        } else {
          onLog(`Unexpected message type: ${msg.type}`);
        }
      } catch (e) {
        onLog(`Error parsing data channel message: ${e.message}`);
      }
    });
  });

  async function handleOffer(offerSdp) {
    if (isClosed) throw new Error('Peer connection is closed');

    try {
      onLog('Setting remote description (offer)');
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });

      onLog('Creating answer');
      const answer = await pc.createAnswer();

      onLog('Setting local description (answer)');
      await pc.setLocalDescription(answer);

      onLog('Answer created successfully');
      onAnswer(answer.sdp);
      return answer.sdp;
    } catch (error) {
      onLog(`Error handling offer: ${error.message}`);
      throw error;
    }
  }

  async function addIceCandidate(candidateInit) {
    if (isClosed) {
      onLog('Cannot add ICE candidate: peer connection is closed');
      return;
    }
    if (!candidateInit) return;

    try {
      const candidate = new RTCIceCandidate(
        candidateInit.candidate,
        candidateInit.sdpMid,
        candidateInit.sdpMLineIndex
      );
      await pc.addIceCandidate(candidate);
      onLog('ICE candidate added successfully');
    } catch (error) {
      onLog(`Error adding ICE candidate: ${error.message}`);
    }
  }

  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    onLog('Cleaning up peer connection');

    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (e) {
        onLog(`Error closing data channel: ${e.message}`);
      }
      dataChannel = null;
    }

    try {
      pc.close();
    } catch (e) {
      onLog(`Error closing peer connection: ${e.message}`);
    }
  }

  function close() {
    cleanup();
  }

  return {
    handleOffer,
    addIceCandidate,
    close,
    get connectionState() {
      return pc.connectionState;
    },
    get iceConnectionState() {
      return pc.iceConnectionState;
    },
  };
}

module.exports = { createNetworkTestPeer, getIceConfig };
