interface ThrottleResult<T> {
  ok: true;
  result: T;
  start: number;
  end: number;
}

interface ThrottleError {
  ok: false;
  error: unknown;
  start: number;
  end: number;
}

export async function throttle<T>(fn: () => Promise<T>, minMs: number): Promise<ThrottleResult<T> | ThrottleError> {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
    return { ok: true, result, start, end: Date.now() };
  } catch (error) {
    const elapsed = Date.now() - start;
    if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
    return { ok: false, error, start, end: Date.now() };
  }
}
