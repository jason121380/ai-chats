import { describe, expect, it } from "vitest"

import {
  buildDiscussionState,
  type RecordedInterjection,
  type RecordedTurn,
} from "@/server/council/resume"
import { HUMAN_SPEAKER_NAME } from "@/server/council/types"

/**
 * Continuing a discussion replays the meeting to the models before anyone
 * speaks. So the reconstruction is not a rendering concern — it IS the prompt.
 * Put a line in the wrong place and the next speaker answers a question that
 * had not been asked yet, confidently, with no sign anything went wrong.
 */

const at = (iso: string) => new Date(iso)

function turn(patch: Partial<RecordedTurn> & { id: string }): RecordedTurn {
  return {
    provider: "OPENAI",
    modelId: "gpt-5.6-luna",
    role: "GENERAL",
    roundNumber: 1,
    turnIndex: 0,
    response: "說了話",
    startedAt: at("2026-09-15T10:00:00Z"),
    completedAt: at("2026-09-15T10:00:10Z"),
    ...patch,
  } as RecordedTurn
}

function said(id: string, iso: string, content = "插話"): RecordedInterjection {
  return { id, content, createdAt: at(iso) }
}

const NAMES = new Map([
  ["OPENAI/gpt-5.6-luna", "GPT-5.6 Luna"],
  ["GOOGLE/gemini-3.8-flash", "Gemini 3.8 Flash"],
])

const twoSpeakers: RecordedTurn[] = [
  turn({
    id: "t1",
    roundNumber: 1,
    turnIndex: 0,
    completedAt: at("2026-09-15T10:00:10Z"),
    response: "A 的第一輪",
  }),
  turn({
    id: "t2",
    provider: "GOOGLE",
    modelId: "gemini-3.8-flash",
    roundNumber: 1,
    turnIndex: 1,
    completedAt: at("2026-09-15T10:00:20Z"),
    response: "B 的第一輪",
  }),
  turn({
    id: "t3",
    roundNumber: 2,
    turnIndex: 2,
    completedAt: at("2026-09-15T10:00:30Z"),
    response: "A 的第二輪",
  }),
]

describe("rebuilding a discussion from the ledger", () => {
  it("places an interjection after the turn it followed, not at the end", () => {
    const state = buildDiscussionState(
      twoSpeakers,
      [said("m1", "2026-09-15T10:00:15Z", "等一下")],
      NAMES
    )
    expect(state.transcript.map((e) => e.content)).toEqual([
      "A 的第一輪",
      "等一下",
      "B 的第一輪",
      "A 的第二輪",
    ])
  })

  it("puts an interjection typed before anyone spoke at the top", () => {
    const state = buildDiscussionState(
      twoSpeakers,
      [said("m1", "2026-09-15T09:59:00Z", "先說一句")],
      NAMES
    )
    expect(state.transcript[0]?.content).toBe("先說一句")
    expect(state.transcript[0]?.speakerName).toBe(HUMAN_SPEAKER_NAME)
  })

  it("keeps several interjections between the same pair of turns in order", () => {
    const state = buildDiscussionState(
      twoSpeakers,
      [
        said("m2", "2026-09-15T10:00:17Z", "第二句"),
        said("m1", "2026-09-15T10:00:15Z", "第一句"),
      ],
      NAMES
    )
    expect(state.transcript.map((e) => e.content)).toEqual([
      "A 的第一輪",
      "第一句",
      "第二句",
      "B 的第一輪",
      "A 的第二輪",
    ])
  })

  it("reports every interjection it placed, so the loop does not re-add them", () => {
    const state = buildDiscussionState(
      twoSpeakers,
      [said("m1", "2026-09-15T09:59:00Z"), said("m2", "2026-09-15T10:00:15Z")],
      NAMES
    )
    expect(state.seenInterjectionIds).toEqual(["m1", "m2"])
  })

  it("resumes the seating in the order people first spoke", () => {
    const state = buildDiscussionState(twoSpeakers, [], NAMES)
    expect(state.participants).toEqual([
      { provider: "OPENAI", modelId: "gpt-5.6-luna" },
      { provider: "GOOGLE", modelId: "gemini-3.8-flash" },
    ])
  })

  it("continues the round and turn counters rather than restarting them", () => {
    const state = buildDiscussionState(
      twoSpeakers,
      [said("m1", "2026-09-15T10:00:15Z")],
      NAMES
    )
    expect(state.lastRound).toBe(2)
    // 3 model turns + 1 interjection already used indexes 0..3.
    expect(state.nextTurnIndex).toBe(4)
  })

  it("names speakers the way the original run did", () => {
    const state = buildDiscussionState(twoSpeakers, [], NAMES)
    expect(state.transcript.map((e) => e.speakerName)).toEqual([
      "GPT-5.6 Luna",
      "Gemini 3.8 Flash",
      "GPT-5.6 Luna",
    ])
  })

  it("drops turns that produced nothing", () => {
    const state = buildDiscussionState(
      [
        ...twoSpeakers,
        turn({ id: "t4", roundNumber: 2, turnIndex: 3, response: null }),
      ],
      [],
      NAMES
    )
    expect(state.transcript).toHaveLength(3)
    // A model that only ever failed is not still in the room.
    expect(state.participants).toHaveLength(2)
  })

  it("survives a discussion with nothing in it", () => {
    const state = buildDiscussionState([], [], NAMES)
    expect(state.transcript).toEqual([])
    expect(state.participants).toEqual([])
    expect(state.lastRound).toBe(1)
    expect(state.nextTurnIndex).toBe(0)
  })

  it("still places interjections when no model ever spoke", () => {
    const state = buildDiscussionState([], [said("m1", "2026-09-15T10:00:00Z")], NAMES)
    expect(state.transcript.map((e) => e.content)).toEqual(["插話"])
  })
})
