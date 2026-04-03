class WorkerRegistry {
  constructor() {
    this.workers = new Map();
    this.CLEANUP_INTERVAL = 90000; // 90 seconds
    this.WORKER_TIMEOUT = 120000; // 120 seconds
    
    // Periodically cleanup stale workers
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  ping(workerId, metadata = {}) {
    this.workers.set(workerId, {
      lastSeen: new Date(),
      metadata,
    });
  }

  getWorkers() {
    const now = new Date();
    return Array.from(this.workers.entries())
      .map(([id, data]) => ({
        id,
        ...data,
        status: (now - data.lastSeen < this.WORKER_TIMEOUT) ? 'online' : 'offline'
      }))
      .filter(w => w.status === 'online'); // Only return active ones for simple view
  }

  cleanup() {
    const now = new Date();
    for (const [id, data] of this.workers.entries()) {
      if (now - data.lastSeen > this.WORKER_TIMEOUT) {
        this.workers.delete(id);
      }
    }
  }
}

export const workerRegistry = new WorkerRegistry();
