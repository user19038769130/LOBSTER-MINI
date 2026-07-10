class StreamBridge {
  constructor() {
    this.subscribers = new Map();
  }
  subscribe(runId, res) {
    if (!this.subscribers.has(runId)) this.subscribers.set(runId, new Set());
    this.subscribers.get(runId).add(res);
    res.on('close', () => {
      const set = this.subscribers.get(runId);
      if (set) set.delete(res);
    });
  }
  publish(runId, event, data) {
    const set = this.subscribers.get(runId);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) res.write(payload);
  }
  publishEnd(runId) {
    const set = this.subscribers.get(runId);
    if (!set) return;
    for (const res of set) {
      res.write('event: end\ndata: [DONE]\n\n');
      res.end();
    }
    this.subscribers.delete(runId);
  }
  async cleanup(runId, delay = 60) {
    setTimeout(() => {
      const set = this.subscribers.get(runId);
      if (set) {
        for (const res of set) res.end();
        this.subscribers.delete(runId);
      }
    }, delay * 1000);
  }
}
module.exports = { StreamBridge };