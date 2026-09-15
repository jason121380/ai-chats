import { describe, expect, it } from "vitest"

import {
  buildDiscussionSystemPrompt,
  buildDiscussionUserPrompt,
} from "@/server/council/discussion-prompts"
import type { DiscussionTurn } from "@/server/council/types"

/**
 * Turn-taking is a rule written in prose, and prose rules regress silently —
 * nothing throws when a line goes missing, the meeting just gets worse. These
 * tests pin the floor contract.
 *
 * The bug they exist for: the opening speaker addressed a participant who had
 * not spoken yet ("Gemini 3.8 Flash, the real strategic question is…"), because
 * the roster named everyone and a blanket "name who you are pushing back on"
 * rule invited it to invent a position for them.
 *
 * Pure string builders, so no database — unlike the other council tests.
 */

const PARTICIPANTS = ["GPT-5.6 Luna", "Gemini 3.8 Flash", "Claude Opus 5"]

function turn(speakerName: string, content: string, i: number): DiscussionTurn {
  return {
    provider: "OPENAI",
    modelId: "gpt-5.6-luna",
    speakerName,
    role: "GENERAL",
    modelRunId: `run-${i}`,
    roundNumber: 1,
    turnIndex: i,
    content,
  }
}

describe("discussion system prompt — taking the floor", () => {
  it("forbids the opener from addressing anyone", () => {
    const prompt = buildDiscussionSystemPrompt(
      "GPT-5.6 Luna",
      "STRATEGIST",
      PARTICIPANTS,
      1,
      3,
      []
    )
    expect(prompt).toContain("Nobody has spoken yet")
    expect(prompt).toContain("nobody to address")
    // The old rule that caused the bug must not survive unconditionally.
    expect(prompt).not.toContain(
      "React to what has actually been said. Name the participant"
    )
  })

  it("points the next speaker at whoever just spoke", () => {
    const prompt = buildDiscussionSystemPrompt(
      "Gemini 3.8 Flash",
      "RESEARCHER",
      PARTICIPANTS,
      1,
      3,
      [turn("GPT-5.6 Luna", "低價店會被壓縮。", 0)]
    )
    expect(prompt).toContain("speaking immediately after GPT-5.6 Luna")
    expect(prompt).toContain("what GPT-5.6 Luna just said")
  })

  it("names who has not spoken yet, so they are not addressed early", () => {
    const prompt = buildDiscussionSystemPrompt(
      "Gemini 3.8 Flash",
      "RESEARCHER",
      PARTICIPANTS,
      1,
      3,
      [turn("GPT-5.6 Luna", "低價店會被壓縮。", 0)]
    )
    expect(prompt).toContain("Claude Opus 5 has not spoken yet")
    expect(prompt).toContain("Do not address them")
  })

  it("does not list a still-silent participant once everyone has spoken", () => {
    const prompt = buildDiscussionSystemPrompt(
      "GPT-5.6 Luna",
      "STRATEGIST",
      PARTICIPANTS,
      2,
      3,
      [
        turn("GPT-5.6 Luna", "a", 0),
        turn("Gemini 3.8 Flash", "b", 1),
        turn("Claude Opus 5", "c", 2),
      ]
    )
    expect(prompt).not.toContain("not spoken yet")
    expect(prompt).toContain("speaking immediately after Claude Opus 5")
  })

  it("treats a participant whose turn failed as not having spoken", () => {
    // Gemini's turn errored, so it is absent from the transcript even though
    // its slot in the round has passed. Addressing it would put words in the
    // mouth of someone who said nothing.
    const prompt = buildDiscussionSystemPrompt(
      "Claude Opus 5",
      "RISK_ANALYST",
      PARTICIPANTS,
      1,
      3,
      [turn("GPT-5.6 Luna", "a", 0)]
    )
    expect(prompt).toContain("Gemini 3.8 Flash has not spoken yet")
  })

  it("always forbids speaking for someone else", () => {
    for (const transcript of [[], [turn("GPT-5.6 Luna", "a", 0)]]) {
      const prompt = buildDiscussionSystemPrompt(
        "Claude Opus 5",
        "RISK_ANALYST",
        PARTICIPANTS,
        1,
        3,
        transcript
      )
      expect(prompt).toContain("Never speak for another participant")
      expect(prompt).toContain("predict what they are about to say")
    }
  })
})

describe("discussion user prompt", () => {
  it("marks the most recent turn and says who to answer", () => {
    const prompt = buildDiscussionUserPrompt("要不要開分店？", [
      turn("GPT-5.6 Luna", "先看單店模型。", 0),
      turn("Gemini 3.8 Flash", "供給側才是問題。", 1),
    ])
    expect(prompt).toContain("Gemini 3.8 Flash: (spoke just now)")
    expect(prompt).not.toContain("GPT-5.6 Luna: (spoke just now)")
    expect(prompt).toContain("right after Gemini 3.8 Flash")
  })

  it("tells the opener there is nothing to respond to", () => {
    const prompt = buildDiscussionUserPrompt("要不要開分店？", [])
    expect(prompt).toContain("nobody to address")
  })
})
