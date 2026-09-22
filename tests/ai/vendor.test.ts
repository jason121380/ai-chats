import { describe, expect, it } from "vitest"

import { vendorOf } from "@/lib/vendor"
import { speakerStyle } from "@/components/council/speaker"

/**
 * A council of four models routed through OpenRouter is four speakers. If
 * every one of them wore the OpenRouter colour, the transcript would read as
 * one model arguing with itself — so identity comes from the vendor in the
 * slug, and only for the gateway; a direct provider is its own vendor.
 */
describe("vendorOf", () => {
  it("is the provider itself for a direct provider", () => {
    expect(vendorOf("ANTHROPIC", "claude-sonnet-4-5")).toBe("ANTHROPIC")
    expect(vendorOf("OPENAI", "anthropic/looks-like-a-slug")).toBe("OPENAI")
  })

  it("reads the vendor from an OpenRouter slug", () => {
    expect(vendorOf("OPENROUTER", "anthropic/claude-sonnet-4.5")).toBe(
      "ANTHROPIC"
    )
    expect(vendorOf("OPENROUTER", "openai/gpt-5.1")).toBe("OPENAI")
    expect(vendorOf("OPENROUTER", "google/gemini-2.5-pro")).toBe("GOOGLE")
    expect(vendorOf("OPENROUTER", "x-ai/grok-4")).toBe("XAI")
  })

  it("strips the latest-alias marker before reading the vendor", () => {
    expect(vendorOf("OPENROUTER", "~openai/gpt-sol-latest")).toBe("OPENAI")
  })

  it("stays OPENROUTER for a vendor with no mark of its own", () => {
    expect(vendorOf("OPENROUTER", "deepseek/deepseek-r1")).toBe("OPENROUTER")
    expect(vendorOf("OPENROUTER", "openrouter/auto")).toBe("OPENROUTER")
    expect(vendorOf("OPENROUTER", "no-slash")).toBe("OPENROUTER")
  })
})

describe("speakerStyle", () => {
  it("gives two OpenRouter models from different vendors different colours", () => {
    const claude = speakerStyle("OPENROUTER", "anthropic/claude-sonnet-4.5")
    const gpt = speakerStyle("OPENROUTER", "openai/gpt-5.1")
    expect(claude).toEqual(speakerStyle("ANTHROPIC"))
    expect(gpt).toEqual(speakerStyle("OPENAI"))
    expect(claude).not.toEqual(gpt)
  })
})
