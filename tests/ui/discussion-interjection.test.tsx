import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { ChatTranscript } from "@/components/council/chat-transcript"
import type { CouncilRunDto, ModelConfigDto } from "@/types/api"

/**
 * An interjection carries only a timestamp, so the transcript has to place it
 * itself. Getting that wrong is silent — the message still appears, just next
 * to the wrong turn, and the meeting reads as if somebody answered a question
 * nobody had asked yet.
 */

const MODELS = [
  {
    id: "1",
    provider: "OPENAI",
    modelId: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    enabled: true,
    defaultRole: "STRATEGIST",
    temperature: null,
    maxOutputTokens: null,
    supportsReasoning: true,
    sortOrder: 1,
    providerConfigured: true,
    pricingConfigured: false,
  },
  {
    id: "2",
    provider: "GOOGLE",
    modelId: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    enabled: true,
    defaultRole: "RESEARCHER",
    temperature: null,
    maxOutputTokens: null,
    supportsReasoning: true,
    sortOrder: 2,
    providerConfigured: true,
    pricingConfigured: false,
  },
] as unknown as ModelConfigDto[]

function modelTurn(
  i: number,
  provider: string,
  modelId: string,
  content: string,
  at: string
) {
  return {
    id: `r${i}`,
    provider,
    modelId,
    stage: "DISCUSSION",
    role: "GENERAL",
    status: "COMPLETED",
    roundNumber: 1,
    turnIndex: i,
    response: content,
    latencyMs: 1000,
    attemptCount: 1,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
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
    startedAt: at,
    completedAt: at,
  }
}

function runWith(interjections: CouncilRunDto["interjections"]): CouncilRunDto {
  return {
    id: "run-1",
    sessionId: "s1",
    kind: "DISCUSSION",
    status: "DISCUSSING",
    currentStage: "DISCUSSION",
    totalRounds: 1,
    currentRound: 1,
    chairmanProvider: null,
    chairmanModel: null,
    startedAt: "2026-09-15T08:00:00Z",
    completedAt: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedInputTokens: 0,
    totalReasoningTokens: 0,
    totalTokens: 0,
    totalCostUsd: null,
    totalLatencyMs: null,
    errorMessage: null,
    createdAt: "2026-09-15T08:00:00Z",
    finalAnswer: null,
    interjections,
    modelRuns: [
      modelTurn(0, "OPENAI", "gpt-5.6-luna", "第一位發言", "2026-09-15T08:00:10Z"),
      modelTurn(
        1,
        "GOOGLE",
        "gemini-3.8-flash",
        "第二位發言",
        "2026-09-15T08:00:30Z"
      ),
    ],
  } as unknown as CouncilRunDto
}

/**
 * Reading order of the things people said, top to bottom.
 *
 * Walks TEXT NODES, not elements: every bubble sits inside several nested
 * wrappers, so `querySelectorAll` returns the same sentence once per ancestor
 * and the order assertion becomes meaningless.
 */
function spokenOrder(container: HTMLElement): string[] {
  const said = ["第一位發言", "第二位發言", "我插話"]
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  let node = walker.nextNode()
  while (node) {
    const text = node.textContent?.trim() ?? ""
    if (said.includes(text)) out.push(text)
    node = walker.nextNode()
  }
  return out
}

describe("discussion transcript — human interjections", () => {
  it("places an interjection after the turn it followed", () => {
    const { container } = render(
      <ChatTranscript
        run={runWith([
          {
            id: "i1",
            content: "我插話",
            createdAt: "2026-09-15T08:00:20Z", // between the two turns
          },
        ])}
        question="開場問題"
        models={MODELS}
      />
    )
    expect(spokenOrder(container)).toEqual([
      "第一位發言",
      "我插話",
      "第二位發言",
    ])
  })

  it("places an interjection typed before anyone spoke at the top", () => {
    const { container } = render(
      <ChatTranscript
        run={runWith([
          { id: "i1", content: "我插話", createdAt: "2026-09-15T08:00:05Z" },
        ])}
        question="開場問題"
        models={MODELS}
      />
    )
    expect(spokenOrder(container)).toEqual([
      "我插話",
      "第一位發言",
      "第二位發言",
    ])
  })

  it("renders nothing extra when nobody interjected", () => {
    const { container } = render(
      <ChatTranscript run={runWith([])} question="開場問題" models={MODELS} />
    )
    expect(spokenOrder(container)).toEqual(["第一位發言", "第二位發言"])
    expect(screen.queryByText("我插話")).toBeNull()
  })
})
