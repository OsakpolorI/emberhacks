/** Single-flight queue, retaining only the newest pending snapshot. */
export class LatestQueue<T, R> {
  private pending: T | undefined;
  private running = false;
  private closed = false;
  private controller: AbortController | null = null;
  private lastStart = 0;
  constructor(
    private work: (item: T, signal: AbortSignal) => Promise<R>,
    private accept: (result: R, item: T) => void,
    private fail: (error: unknown) => void,
    private minimumGapMs = 0,
  ) {}
  push(item: T) {
    if (this.closed) return;
    this.pending = item;
    void this.drain();
  }
  private async drain() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (this.pending !== undefined && !this.closed) {
        this.controller = new AbortController();
        try {
          const wait = Math.max(0, this.minimumGapMs - (Date.now() - this.lastStart));
          if (wait)
            await new Promise<void>((resolve) => {
              const finish = () => {
                clearTimeout(timeout);
                this.controller?.signal.removeEventListener('abort', finish);
                resolve();
              };
              const timeout = setTimeout(finish, wait);
              this.controller!.signal.addEventListener('abort', finish, { once: true });
            });
          if (this.closed) break;
          const item = this.pending!;
          this.pending = undefined;
          this.lastStart = Date.now();
          const value = await this.work(item, this.controller.signal);
          if (!this.closed) this.accept(value, item);
        } catch (e) {
          if (!this.closed) this.fail(e);
        }
      }
    } finally {
      this.running = false;
    }
  }
  close() {
    this.closed = true;
    this.pending = undefined;
    this.controller?.abort();
  }
}
