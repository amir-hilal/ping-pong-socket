const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // later you can restrict to your Netlify URL
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4000;

// you no longer need to serve the client from here for Netlify,
// but it is harmless to keep this line
app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('ping', (data) => {
    const serverReceivedAt = Date.now();
    console.log(
      `Ping received, Seq: ${data.sequenceNumber}, ClientSentAt: ${data.clientSentAt}`
    );

    const serverSentAt = Date.now();
    socket.emit('pong', {
      sequenceNumber: data.sequenceNumber,
      clientSentAt: data.clientSentAt,
      serverReceivedAt,
      serverSentAt,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
