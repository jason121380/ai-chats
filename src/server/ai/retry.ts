import { ProviderError } from "./types"

export interface RetryOptions {
  /** Maximum number of retries after the first attempt (spec: 2). */
  maxRetries?: number
  /** Base backoff delay in ms; grows exponentially (base, base*2, base*4...). */
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export interface RetryOutcome<T> {
  result: T
  attemptCount: number
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Retry policy: only retry retryable provider errors (429, provider 5xx,
 * temporary network errors), at most `maxRetries` times, with exponential
 * backoff. 401/403/invalid request/validation errors never retry.
 * Aborts (timeouts) never retry — the whole operation has one deadline.
 */
export async function withRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryOutcome<T>> {
  const maxRetries = options.maxRetries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 500
  const sleep = options.sleep ?? defaultSleep

  let attemptCount = 0
  // attempts = 1 initial + maxRetries
  for (;;) {
    attemptCount += 1
    try {
      const result = await operation()
      return { result, attemptCount }
    } catch (err) {
      const isRetryable = err instanceof ProviderError && err.retryable
      const isAbort = err instanceof Error && err.name === "AbortError"
      if (!isRetryable || isAbort || attemptCount > maxRetries) {
        throw err
      }
      await sleep(baseDelayMs * 2 ** (attemptCount - 1))
    }
  }
}
