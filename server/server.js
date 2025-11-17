const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { createNetworkTestPeer } = require('./webrtcNetworkTestPeer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'https://dapper-piroshki-f8eedd.netlify.app',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 10000;

// you no longer need to serve the client from here for Netlify,
// but it is harmless to keep this line
app.use(express.static(path.join(__dirname, '../client')));

// Helper function to calculate message size in bytes
function getMessageSize(data) {
  return Buffer.byteLength(JSON.stringify(data), 'utf8');
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Store WebRTC peer instance for this socket connection
  let webrtcPeer = null;

  // ==========================================
  // Classic Socket.IO Ping/Pong (existing)
  // ==========================================
  socket.on('ping', (data) => {
    const serverReceivedAt = Date.now();
    const receivedSize = getMessageSize(data);

    console.log(
      `Ping received, Seq: ${data.sequenceNumber}, ClientSentAt: ${data.clientSentAt}, Size: ${receivedSize} bytes`
    );

    const serverSentAt = Date.now();
    const pongData = {
      sequenceNumber: data.sequenceNumber,
      clientSentAt: data.clientSentAt,
      serverReceivedAt,
      serverSentAt,
    };

    const sentSize = getMessageSize(pongData);
    socket.emit('pong', pongData);

    console.log(
      `Pong sent, Seq: ${data.sequenceNumber}, Size: ${sentSize} bytes`
    );
  });

  // ==========================================
  // WebRTC Network Test Signaling
  // ==========================================

  /**
   * Handle WebRTC offer from client
   * Creates a new peer connection and sends back an answer
   */
  socket.on('webrtc-offer', async (message) => {
    try {
      console.log(`[${socket.id}] WebRTC offer received`);

      // Clean up existing peer if any
      if (webrtcPeer) {
        console.log(`[${socket.id}] Closing existing WebRTC peer`);
        webrtcPeer.close();
      }

      // Create new WebRTC peer for this client
      webrtcPeer = createNetworkTestPeer({
        onLog: (msg) => console.log(`[${socket.id}] ${msg}`),

        onAnswer: (sdp) => {
          // Answer is sent via handleOffer, but this callback can be used for logging
          console.log(`[${socket.id}] Answer created`);
        },

        onIceCandidate: (candidate) => {
          // Send ICE candidate to client
          socket.emit('webrtc-ice-candidate', {
            candidate: candidate,
          });
          console.log(`[${socket.id}] ICE candidate sent to client`);
        },

        onConnectionStateChange: (state) => {
          console.log(`[${socket.id}] WebRTC connection state: ${state}`);

          // Notify client of connection state changes
          socket.emit('webrtc-connection-state', { state });

          // Clean up on failure
          if (state === 'failed' || state === 'closed') {
            if (webrtcPeer) {
              webrtcPeer.close();
              webrtcPeer = null;
            }
          }
        },
      });

      // Handle the offer and create answer
      const answerSdp = await webrtcPeer.handleOffer(message.payload.sdp);

      // Send answer back to client
      socket.emit('webrtc-answer', {
        payload: {
          sdp: answerSdp,
          type: 'answer',
        },
      });

      console.log(`[${socket.id}] WebRTC answer sent to client`);
    } catch (error) {
      console.error(`[${socket.id}] Error handling WebRTC offer:`, error);
      socket.emit('webrtc-error', {
        error: error.message,
      });
    }
  });

  /**
   * Handle ICE candidate from client
   * Adds the candidate to the peer connection
   */
  socket.on('webrtc-ice-candidate', async (message) => {
    try {
      if (!webrtcPeer) {
        console.warn(
          `[${socket.id}] Received ICE candidate but no peer exists`
        );
        return;
      }

      console.log(`[${socket.id}] ICE candidate received from client`);
      await webrtcPeer.addIceCandidate(message.payload.candidate);
    } catch (error) {
      console.error(`[${socket.id}] Error adding ICE candidate:`, error);
    }
  });

  // ==========================================
  // Cleanup on Disconnect
  // ==========================================
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Clean up WebRTC peer if it exists
    if (webrtcPeer) {
      console.log(`[${socket.id}] Cleaning up WebRTC peer on disconnect`);
      webrtcPeer.close();
      webrtcPeer = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
