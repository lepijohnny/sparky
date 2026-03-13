export interface Throttle {
  acquire(): Promise<void>;
  backoff(): void;
}

export function createThrottle(intervalMs: number, backoffMs: number): Throttle {
  let lastCall = 0;
  let currentInterval = intervalMs;

  return {
    async acquire() {
      const now = Date.now();
      const wait = currentInterval - (now - lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
    },

    backoff() {
      currentInterval = backoffMs;
      setTimeout(() => { currentInterval = intervalMs; }, backoffMs);
    },
  };
}
