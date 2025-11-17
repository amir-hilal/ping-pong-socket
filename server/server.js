const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
