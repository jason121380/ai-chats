import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { ChatMessage } from "@/components/council/chat-message"
import { t } from "@/lib/i18n"
import type { ModelRunDto } from "@/types/api"

/**
 * A ModelRun row exists from the moment a turn starts, with `response` still
 * null. Rendering that as「沒有回傳內容」told the reader the model had finished
 * and said nothing — a claim about a completed turn, made about one that was
 * still generating. The two states must never share a rendering.
 */

function runWith(patch: Partial<ModelRunDto>): ModelRunDto {
  return {
    id: "r1",
    provider: "GOOGLE",
    modelId: "gemini-3.8-flash",
    stage: "DISCUSSION",
    role: "RESEARCHER",
    status: "COMPLETED",
    roundNumber: 1,
    turnIndex: 0,
    response: "說了話",
    latencyMs: 7900,
    attemptCount: 1,
    inputTokens: 428,
    outputTokens: 526,
    totalTokens: 954,
    cachedInputTokens: null,
    reasoningTokens: null,
    inputCostUsd: null,
    outputCostUsd: null,
    cachedInputCostUsd: null,
    reasoningCostUsd: null,
    totalCostUsd: null,
    pricingStatus: "MISSING",
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-09-15T08:49:05Z",
    completedAt: "2026-09-15T08:49:13Z",
    ...patch,
  } as unknown as ModelRunDto
}

describe("a turn still in flight", () => {
  for (const status of ["PENDING", "RUNNING"]) {
    it(`shows the typing indicator, not 沒有回傳內容 (${status})`, () => {
      render(
        <ChatMessage
          run={runWith({ status, response: null, completedAt: null })}
          displayName="Gemini 3.8 Flash"
        />
      )
      expect(screen.getAllByLabelText(t.transcript.typing).length).toBe(1)
      expect(screen.queryByText(t.transcript.noContent)).toBeNull()
    })
  }

  it("hides the token footer while it is all em-dashes", () => {
    const { container } = render(
      <ChatMessage
        run={runWith({
          status: "RUNNING",
          response: null,
          completedAt: null,
          latencyMs: null,
          inputTokens: null,
          outputTokens: null,
        })}
        displayName="Gemini 3.8 Flash"
      />
    )
    expect(container.textContent).not.toContain(t.stats.inOutTokens)
  })

  it("still says 沒有回傳內容 when a FINISHED turn returned nothing", () => {
    render(
      <ChatMessage
        run={runWith({ status: "COMPLETED", response: null })}
        displayName="Gemini 3.8 Flash"
      />
    )
    expect(screen.getByText(t.transcript.noContent)).toBeTruthy()
    expect(screen.queryByLabelText(t.transcript.typing)).toBeNull()
  })

  /**
   * A successful turn carries its speaker's name inside the bubble and a
   * failed one did not, so a round where three participants fell over was
   * three identical red boxes: same wording, same wrapped network error, no
   * way to tell which models they were. The avatar does not settle it either,
   * since it shows the vendor behind a gateway slug rather than the route.
   */
  it("names the speaker and the model on a failed turn", () => {
    render(
      <ChatMessage
        run={runWith({
          status: "FAILED",
          response: null,
          errorCode: "NETWORK",
          errorMessage: "Network error: fetch failed",
          modelId: "google/gemini-3.8-flash",
        })}
        displayName="Gemini 3.8 Flash"
      />
    )
    expect(
      screen.getByText(
        (_, el) =>
          el?.textContent === `Gemini 3.8 Flash · ${t.transcript.failedTitle}`
      )
    ).toBeTruthy()
    expect(screen.getByText("google/gemini-3.8-flash")).toBeTruthy()
    expect(
      screen.getByText("NETWORK: Network error: fetch failed")
    ).toBeTruthy()
    expect(screen.queryByLabelText(t.transcript.typing)).toBeNull()
  })
})
