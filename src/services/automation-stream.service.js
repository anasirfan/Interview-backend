class AutomationStreamService {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(jobId, res) {
    const key = String(jobId);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }

    this.subscribers.get(key).add(res);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    this.publish(key, 'connected', { jobId: key, connected: true });
  }

  unsubscribe(jobId, res) {
    const key = String(jobId);
    const listeners = this.subscribers.get(key);
    if (!listeners) return;

    listeners.delete(res);
    if (listeners.size === 0) {
      this.subscribers.delete(key);
    }
  }

  publish(jobId, event, payload) {
    const key = String(jobId);
    const listeners = this.subscribers.get(key);
    if (!listeners || listeners.size === 0) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of listeners) {
      try {
        res.write(message);
      } catch (_error) {
        this.unsubscribe(key, res);
      }
    }
  }
}

module.exports = new AutomationStreamService();
