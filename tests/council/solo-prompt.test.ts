import { describe, expect, it } from "vitest"

import {
  buildRoundOneSystemPrompt,
  buildSoloSystemPrompt,
} from "@/server/council/prompts"

/**
 * Every path that calls a model pins the reply language. Solo chat used to
 * send no system prompt at all, and a two-character question came back in
 * Japanese: the model had nothing but the characters to go on.
 */
describe("the solo system prompt", () => {
  it("pins the reply to Traditional Chinese, the same way the council does", () => {
    const solo = buildSoloSystemPrompt()
    expect(solo).toContain("繁體中文")
    expect(buildRoundOneSystemPrompt("GENERAL")).toContain(solo)
  })
})
