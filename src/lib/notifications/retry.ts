export interface RetryOptions {
  /** Total attempts including the first. Must be >= 1. */
  attempts: number;
  /** Delay before the 2nd attempt; doubles after each subsequent failure. */
  baseDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `fn` up to `options.attempts` times with exponential backoff
 * (ADR 0061), rethrowing the last rejection once attempts are exhausted.
 * No module-level state: every call tracks its own attempt count, so
 * concurrent/repeated calls never share or leak state.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, baseDelayMs } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}
