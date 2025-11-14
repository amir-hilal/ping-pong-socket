class LatencyTester {
  constructor() {
    this.socket = null;
    this.sequenceNumber = 0;
    this.pingInterval = 1000; // Default 1 second
    this.pingTimer = null;

    // Metrics tracking
    this.rttSamples = [];
    this.maxSamples = 50; // Keep last 50 samples for rolling average
    this.packetsSent = 0;
    this.packetsReceived = 0;
    this.receivedSequenceNumbers = new Set();
    this.highestSequenceSent = 0;

    // DOM elements
    this.elements = {
      connectionStatus: document.getElementById('connectionStatus'),
      pingInterval: document.getElementById('pingInterval'),
      lastLatency: document.getElementById('lastLatency'),
      avgLatency: document.getElementById('avgLatency'),
      jitter: document.getElementById('jitter'),
      packetsSent: document.getElementById('packetsSent'),
      packetsReceived: document.getElementById('packetsReceived'),
      packetLoss: document.getElementById('packetLoss'),
      log: document.getElementById('log'),
    };

    this.init();
  }

  init() {
    this.connectToServer();
    this.setupEventListeners();
  }

  connectToServer() {
    this.socket = io();

    this.socket.on('connect', () => {
      this.log('Connected to server');
      this.updateConnectionStatus(true);
      this.startPinging();
    });

    this.socket.on('disconnect', () => {
      this.log('Disconnected from server');
      this.updateConnectionStatus(false);
      this.stopPinging();
    });

    this.socket.on('pong', (data) => {
      this.handlePong(data);
    });

    this.socket.on('connect_error', (error) => {
      this.log(`Connection error: ${error.message}`);
    });
  }

  setupEventListeners() {
    this.elements.pingInterval.addEventListener('change', (e) => {
      this.pingInterval = parseInt(e.target.value);
      this.log(`Ping interval changed to ${this.pingInterval}ms`);

      // Restart pinging with new interval
      if (this.socket && this.socket.connected) {
        this.stopPinging();
        this.startPinging();
      }
    });
  }

  startPinging() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }

    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.pingInterval);

    // Send first ping immediately
    this.sendPing();
  }

  stopPinging() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  sendPing() {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.sequenceNumber++;
    this.highestSequenceSent = this.sequenceNumber;
    this.packetsSent++;

    const pingData = {
      sequenceNumber: this.sequenceNumber,
      clientSentAt: Date.now(),
    };

    this.socket.emit('ping', pingData);
    this.log(`Ping sent - Seq: ${this.sequenceNumber}`);
    this.updateMetricsDisplay();
  }

  handlePong(data) {
    const clientReceivedAt = Date.now();
    const rtt = clientReceivedAt - data.clientSentAt;

    // Track received sequence numbers
    this.receivedSequenceNumbers.add(data.sequenceNumber);
    this.packetsReceived++;

    // Add RTT sample
    this.rttSamples.push(rtt);
    if (this.rttSamples.length > this.maxSamples) {
      this.rttSamples.shift(); // Remove oldest sample
    }

    this.log(`Pong received - Seq: ${data.sequenceNumber}, RTT: ${rtt}ms`);
    this.updateMetricsDisplay();
  }

  calculateMetrics() {
    const metrics = {
      lastLatency: 0,
      avgLatency: 0,
      jitter: 0,
      packetLoss: 0,
    };

    if (this.rttSamples.length > 0) {
      // Last latency
      metrics.lastLatency = this.rttSamples[this.rttSamples.length - 1];

      // Average latency
      const sum = this.rttSamples.reduce((acc, rtt) => acc + rtt, 0);
      metrics.avgLatency =
        Math.round((sum / this.rttSamples.length) * 100) / 100;

      // Jitter (average absolute difference between consecutive samples)
      if (this.rttSamples.length > 1) {
        let jitterSum = 0;
        for (let i = 1; i < this.rttSamples.length; i++) {
          jitterSum += Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]);
        }
        metrics.jitter =
          Math.round((jitterSum / (this.rttSamples.length - 1)) * 100) / 100;
      }
    }

    // Packet loss
    if (this.packetsSent > 0) {
      const lostCount = this.packetsSent - this.packetsReceived;
      metrics.packetLoss =
        Math.round((lostCount / this.packetsSent) * 100 * 100) / 100;
    }

    return metrics;
  }

  updateMetricsDisplay() {
    const metrics = this.calculateMetrics();

    this.elements.lastLatency.textContent = Math.round(metrics.lastLatency);
    this.elements.avgLatency.textContent = metrics.avgLatency;
    this.elements.jitter.textContent = metrics.jitter;
    this.elements.packetsSent.textContent = this.packetsSent;
    this.elements.packetsReceived.textContent = this.packetsReceived;
    this.elements.packetLoss.textContent = metrics.packetLoss;
  }

  updateConnectionStatus(connected) {
    if (connected) {
      this.elements.connectionStatus.textContent = 'Connected';
      this.elements.connectionStatus.className = 'status connected';
    } else {
      this.elements.connectionStatus.textContent = 'Disconnected';
      this.elements.connectionStatus.className = 'status disconnected';
    }
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;

    this.elements.log.appendChild(logEntry);
    this.elements.log.scrollTop = this.elements.log.scrollHeight;

    // Keep only last 100 log entries
    while (this.elements.log.children.length > 100) {
      this.elements.log.removeChild(this.elements.log.firstChild);
    }
  }
}

// Initialize the latency tester when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new LatencyTester();
});
