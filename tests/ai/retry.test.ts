import { describe, expect, it, vi } from "vitest"

import { withRetries } from "@/server/ai/retry"
import { ProviderError } from "@/server/ai/types"

const noSleep = () => Promise.resolve()

function rateLimited() {
  return new ProviderError("429", { code: "RATE_LIMITED", httpStatus: 429 })
}

describe("withRetries", () => {
  it("succeeds without retrying on first success", async () => {
    const op = vi.fn().mockResolvedValue("ok")
    const { result, attemptCount } = await withRetries(op, { sleep: noSleep })
    expect(result).toBe("ok")
    expect(attemptCount).toBe(1)
  })

  it("retries a 429 up to 2 times, then succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue("ok")
    const { result, attemptCount } = await withRetries(op, { sleep: noSleep })
    expect(result).toBe("ok")
    expect(attemptCount).toBe(3)
  })

  it("gives up after 2 retries (3 attempts total)", async () => {
    const op = vi.fn().mockRejectedValue(rateLimited())
    await expect(withRetries(op, { sleep: noSleep })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    })
    expect(op).toHaveBeenCalledTimes(3)
  })

  it("never retries auth errors", async () => {
    const op = vi.fn().mockRejectedValue(
      new ProviderError("401", { code: "AUTH", retryable: false })
    )
    await expect(withRetries(op, { sleep: noSleep })).rejects.toMatchObject({
      code: "AUTH",
    })
    expect(op).toHaveBeenCalledTimes(1)
  })

  it("never retries aborts (timeout has one deadline)", async () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    const op = vi.fn().mockRejectedValue(abort)
    await expect(withRetries(op, { sleep: noSleep })).rejects.toBe(abort)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it("uses exponential backoff delays", async () => {
    const delays: number[] = []
    const sleep = (ms: number) => {
      delays.push(ms)
      return Promise.resolve()
    }
    const op = vi
      .fn()
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue("ok")
    await withRetries(op, { sleep, baseDelayMs: 100 })
    expect(delays).toEqual([100, 200])
  })
})
