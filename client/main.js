class LatencyTester {
  constructor() {
    this.socket = null;
    this.sequenceNumber = 0;
    this.pingInterval = 200; // Default 200ms for more responsive measurements
    this.pingTimer = null;
    this.lossSweepTimer = null;

    // Enhanced metrics tracking
    this.rttSamples = [];
    this.maxSamples = 50; // Keep last 50 samples for rolling average
    this.packetsSent = 0;
    this.packetsReceived = 0;
    this.pendingPings = new Map(); // Map<sequenceNumber, clientSentAt>
    this.lostCount = 0;
    this.lossTimeoutFactor = 5; // Consider ping lost after 5 * pingInterval

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
      networkQuality: document.getElementById('networkQuality'),
      log: document.getElementById('log'),
    };

    this.init();
  }

  init() {
    this.connectToServer();
    this.setupEventListeners();
  }

  connectToServer() {
    this.socket = io('https://ping-pong-socket.onrender.com', {
      transports: ['websocket'], // Better for latency tests
    });

    this.socket.on('connect', () => {
      this.log('Connected to server');
      this.updateConnectionStatus(true);
      this.startPinging();
      this.startLossSweep();
    });

    this.socket.on('disconnect', () => {
      this.log('Disconnected from server');
      this.updateConnectionStatus(false);
      this.stopPinging();
      this.stopLossSweep();
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

      // Restart pinging and loss sweep with new interval
      if (this.socket && this.socket.connected) {
        this.stopPinging();
        this.stopLossSweep();
        this.startPinging();
        this.startLossSweep();
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

  startLossSweep() {
    if (this.lossSweepTimer) {
      clearInterval(this.lossSweepTimer);
    }

    // Run loss sweep every max(pingInterval, 500)ms
    const sweepInterval = Math.max(this.pingInterval, 500);
    this.lossSweepTimer = setInterval(() => {
      this.performLossSweep();
    }, sweepInterval);
  }

  stopLossSweep() {
    if (this.lossSweepTimer) {
      clearInterval(this.lossSweepTimer);
      this.lossSweepTimer = null;
    }
  }

  performLossSweep() {
    const now = Date.now();
    const lossTimeout = this.pingInterval * this.lossTimeoutFactor;

    for (const [sequenceNumber, clientSentAt] of this.pendingPings) {
      if (now - clientSentAt > lossTimeout) {
        this.lostCount++;
        this.pendingPings.delete(sequenceNumber);
        this.log(`Ping ${sequenceNumber} considered lost (timeout)`);
      }
    }

    // Update metrics if any pings were lost
    if (this.lostCount > 0) {
      this.updateMetricsDisplay();
    }
  }

  sendPing() {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.sequenceNumber++;
    this.packetsSent++;

    const clientSentAt = Date.now();
    const pingData = {
      sequenceNumber: this.sequenceNumber,
      clientSentAt: clientSentAt,
    };

    // Store in pending pings for loss detection
    this.pendingPings.set(this.sequenceNumber, clientSentAt);

    this.socket.emit('ping', pingData);
    this.log(`Ping sent - Seq: ${this.sequenceNumber}`);
    this.updateMetricsDisplay();
  }

  handlePong(data) {
    const clientReceivedAt = Date.now();
    const rtt = clientReceivedAt - data.clientSentAt;

    // Remove from pending pings (successful response)
    this.pendingPings.delete(data.sequenceNumber);
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
      // Last latency (rounded to integer)
      metrics.lastLatency = Math.round(
        this.rttSamples[this.rttSamples.length - 1]
      );

      // Average latency (rounded to 2 decimals)
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

    // Packet loss based on lost count (rounded to 2 decimals)
    const totalSent = this.packetsSent || 1; // Avoid division by zero
    metrics.packetLoss =
      Math.round((this.lostCount / totalSent) * 100 * 100) / 100;

    return metrics;
  }

  getNetworkQuality(metrics) {
    const { avgLatency, jitter, packetLoss } = metrics;

    // Need at least 5 samples for meaningful classification
    if (this.packetsSent < 5) return 'Unknown';

    // Good: low latency, low jitter, almost no loss
    if (avgLatency < 120 && jitter < 30 && packetLoss < 1) return 'Good';

    // Moderate: medium latency/jitter/loss
    if (avgLatency < 250 && jitter < 80 && packetLoss < 3) return 'Moderate';

    // Poor: high latency or jitter or significant packet loss
    return 'Poor';
  }

  updateMetricsDisplay() {
    const metrics = this.calculateMetrics();

    // Update basic metrics
    this.elements.lastLatency.textContent = metrics.lastLatency;
    this.elements.avgLatency.textContent = metrics.avgLatency;
    this.elements.jitter.textContent = metrics.jitter;
    this.elements.packetsSent.textContent = this.packetsSent;
    this.elements.packetsReceived.textContent = this.packetsReceived;
    this.elements.packetLoss.textContent = metrics.packetLoss;

    // Update network quality with styling
    const quality = this.getNetworkQuality(metrics);
    this.elements.networkQuality.textContent = quality;

    // Remove previous quality classes
    this.elements.networkQuality.className =
      this.elements.networkQuality.className.replace(/quality-\w+/g, '');

    // Add new quality class
    this.elements.networkQuality.classList.add(
      `quality-${quality.toLowerCase()}`
    );
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
