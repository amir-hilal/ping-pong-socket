const { RTCPeerConnection } = require('wrtc');

/**
 * Get ICE server configuration
 * Using Google's public STUN server for now
 * Can be extended to include TURN servers with credentials
 */
function getIceConfig() {
  return {
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
        ],
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
function createNetworkTestPeer(options = {}) {
  const {
    onLog = () => {},
    onAnswer = () => {},
    onIceCandidate = () => {},
    onConnectionStateChange = () => {},
  } = options;

  // Create RTCPeerConnection with ICE configuration
  const peerConnection = new RTCPeerConnection(getIceConfig());
  let dataChannel = null;
  let isClosed = false;

  onLog('WebRTC peer connection created');

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      onLog(`ICE candidate generated: ${event.candidate.candidate}`);
      onIceCandidate(event.candidate);
    } else {
      onLog('ICE candidate gathering complete');
    }
  };

  // Handle connection state changes
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    onLog(`Connection state changed to: ${state}`);
    onConnectionStateChange(state);

    // Clean up on failure or closure
    if (state === 'failed' || state === 'closed') {
      cleanup();
    }
  };

  // Handle ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    onLog(`ICE connection state: ${peerConnection.iceConnectionState}`);
  };

  // Handle incoming data channel from client
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    onLog(`Data channel received: ${dataChannel.label}`);

    // Handle data channel open
    dataChannel.onopen = () => {
      onLog(`Data channel opened: ${dataChannel.label}`);
    };

    // Handle data channel close
    dataChannel.onclose = () => {
      onLog(`Data channel closed: ${dataChannel.label}`);
      dataChannel = null;
    };

    // Handle data channel errors
    dataChannel.onerror = (error) => {
      onLog(`Data channel error: ${error.message || error}`);
    };

    // Handle incoming messages on data channel
    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Echo ping messages back as pong
        if (message.type === 'ping') {
          const pongMessage = {
            type: 'pong',
            t: message.t, // Echo back the same timestamp
          };
          
          if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(pongMessage));
            onLog(`Ping received (t=${message.t}), pong sent`);
          }
        } else {
          onLog(`Unexpected message type: ${message.type}`);
        }
      } catch (error) {
        onLog(`Error parsing data channel message: ${error.message}`);
      }
    };
  };

  /**
   * Handle offer from client and create answer
   * @param {string} offerSdp - SDP offer from client
   * @returns {Promise<string>} Answer SDP
   */
  async function handleOffer(offerSdp) {
    if (isClosed) {
      throw new Error('Peer connection is closed');
    }

    try {
      onLog('Setting remote description (offer)');
      await peerConnection.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp,
      });

      onLog('Creating answer');
      const answer = await peerConnection.createAnswer();

      onLog('Setting local description (answer)');
      await peerConnection.setLocalDescription(answer);

      onLog('Answer created successfully');
      onAnswer(answer.sdp);

      return answer.sdp;
    } catch (error) {
      onLog(`Error handling offer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add ICE candidate from client
   * @param {Object} candidate - ICE candidate object
   */
  async function addIceCandidate(candidate) {
    if (isClosed) {
      onLog('Cannot add ICE candidate: peer connection is closed');
      return;
    }

    try {
      if (candidate) {
        await peerConnection.addIceCandidate(candidate);
        onLog('ICE candidate added successfully');
      }
    } catch (error) {
      onLog(`Error adding ICE candidate: ${error.message}`);
    }
  }

  /**
   * Clean up resources
   */
  function cleanup() {
    if (isClosed) return;

    onLog('Cleaning up peer connection');
    isClosed = true;

    // Close data channel if open
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (error) {
        onLog(`Error closing data channel: ${error.message}`);
      }
      dataChannel = null;
    }

    // Close peer connection
    try {
      peerConnection.close();
    } catch (error) {
      onLog(`Error closing peer connection: ${error.message}`);
    }
  }

  /**
   * Close the peer connection
   */
  function close() {
    cleanup();
  }

  // Return public interface
  return {
    handleOffer,
    addIceCandidate,
    close,
    get connectionState() {
      return peerConnection.connectionState;
    },
    get iceConnectionState() {
      return peerConnection.iceConnectionState;
    },
  };
}

module.exports = {
  createNetworkTestPeer,
  getIceConfig,
};
