# Socket.IO Latency Test

A minimal, well-structured latency test setup using Socket.IO with a browser client and Node.js server. Measures round-trip latency, jitter, and packet loss using a ping-pong pattern.

## Features

- Real-time latency measurement between browser and Node.js server
- Configurable ping intervals (250ms, 500ms, 1000ms, 2000ms)
- Metrics tracking:
  - Last latency
  - Rolling average latency (last 50 samples)
  - Jitter estimation
  - Packet loss percentage
- Clean, responsive web interface
- Real-time activity logging
- Immediate server response (no artificial delays)

## Project Structure

```
ping-pong-socket/
├── package.json
├── server/
│   └── server.js          # Node.js server with Socket.IO
├── client/
│   ├── index.html         # Browser client interface
│   └── main.js           # Client-side ping-pong logic
└── README.md
```

## How to Run

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

Or directly:

```bash
node server/server.js
```

The server will start on http://localhost:4000

### 3. Open the Client

Open your web browser and navigate to:

```
http://localhost:4000
```

The client will automatically connect to the server and start the latency test.

## Usage

1. **Connection**: The client automatically connects to the server when the page loads
2. **Ping Interval**: Use the dropdown to change the ping frequency (250ms to 2000ms)
3. **Metrics**: Watch real-time metrics update with each ping-pong cycle:
   - **Last Latency**: Most recent round-trip time
   - **Average Latency**: Rolling average of last 50 samples
   - **Jitter**: Average absolute difference between consecutive samples
   - **Packets Sent/Received**: Total count of ping/pong messages
   - **Packet Loss**: Percentage of lost packets
4. **Activity Log**: Monitor connection events and ping-pong messages

## Technical Details

### Server (server.js)
- Express.js with Socket.IO
- Serves static client files
- Handles 'ping' events and responds with 'pong'
- Includes timestamps for server processing time
- Basic logging for connections and pings

### Client (main.js)
- Socket.IO client connection
- Configurable ping loop
- RTT calculation and metrics tracking
- Real-time UI updates
- Rolling window for statistics (last 50 samples)

### Metrics Calculation

- **Round-trip Latency**: `Date.now() - clientSentAt`
- **Average Latency**: Mean of all RTT samples in rolling window
- **Jitter**: Average absolute difference between consecutive RTT samples
- **Packet Loss**: `(sent - received) / sent * 100`

## Dependencies

- express: ^4.18.2
- socket.io: ^4.7.2

## Browser Compatibility

Works with all modern browsers that support WebSockets and ES6+ JavaScript features.
