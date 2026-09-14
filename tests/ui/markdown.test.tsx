import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Markdown } from "@/components/ui/markdown"

describe("Markdown", () => {
  it("renders headings, lists and tables from chairman-style output", () => {
    const { container } = render(
      <Markdown>{`## Executive Summary

Go, carefully.

- first point
- second point

| Phase | Owner |
|---|---|
| Validation | BD |`}</Markdown>
    )
    expect(screen.getByText("Executive Summary").tagName).toBe("H2")
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.querySelector("table")).not.toBeNull()
  })

  /**
   * Regression guard. CommonMark's flanking rules leave `而是**「X」**`
   * as literal asterisks because the delimiter sits between a CJK character
   * and CJK punctuation. Models write exactly that in Chinese, so the
   * CJK-friendly plugin is load-bearing, not cosmetic.
   */
  it("bolds emphasis wrapped in CJK punctuation", () => {
    const { container } = render(
      <Markdown>
        {"真正該問的不是「該不該投資越南」，而是**「為什麼是越南」**這個問題。"}
      </Markdown>
    )
    const strong = container.querySelector("strong")
    expect(strong).not.toBeNull()
    expect(strong!.textContent).toBe("「為什麼是越南」")
    expect(container.textContent).not.toContain("**")
  })

  it("bolds emphasis that sits flush against CJK characters", () => {
    const { container } = render(
      <Markdown>{"我的結論是**值得進，但不是明年**，理由如下。"}</Markdown>
    )
    expect(container.querySelector("strong")?.textContent).toBe(
      "值得進，但不是明年"
    )
    expect(container.textContent).not.toContain("**")
  })
})
