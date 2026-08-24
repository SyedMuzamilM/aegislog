export interface BatchDispatcherOptions<T> {
  batchSize: number;
  flushIntervalMs: number;
  deliver: (items: T[]) => Promise<void>;
}

export class BatchDispatcher<T> {
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly deliver: (items: T[]) => Promise<void>;
  private readonly queue: T[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;

  constructor(options: BatchDispatcherOptions<T>) {
    this.batchSize = Math.max(1, options.batchSize);
    this.flushIntervalMs = Math.max(1, options.flushIntervalMs);
    this.deliver = options.deliver;
  }

  public enqueue(item: T): void {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize) {
      this.clearTimer();
      void this.flush().catch(() => this.schedule());
      return;
    }
    this.schedule();
  }

  public async flush(): Promise<void> {
    this.clearTimer();

    while (this.queue.length > 0 || this.inFlight) {
      if (this.inFlight) {
        await this.inFlight;
        continue;
      }

      const batch = this.queue.splice(0, this.batchSize);
      const delivery = this.deliver(batch).catch((error: unknown) => {
        this.queue.unshift(...batch);
        throw error;
      });
      this.inFlight = delivery;

      try {
        await delivery;
      } finally {
        if (this.inFlight === delivery) {
          this.inFlight = undefined;
        }
      }
    }
  }

  private schedule(): void {
    if (this.timer || this.queue.length === 0) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush().catch(() => this.schedule());
    }, this.flushIntervalMs);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
