import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * No full-viewport height may be expressed in `vh`.
 *
 * On a phone `100vh` is the LARGE viewport — the height the page would have
 * if the address bar and toolbar were hidden. It is bigger than what the
 * person can see. A shell at `min-height: 100vh` is therefore taller than
 * the screen by exactly the height of the browser chrome: the document
 * scrolls, and anything meant to sit at the bottom of the viewport sits
 * above a band of blank space instead.
 *
 * That is what happened. `min-h-screen` compiles to `min-height: 100vh`, and
 * the chat screen underneath it was sized in `dvh` — so the shell was ~130px
 * taller than the chat screen and the composer floated above the gap.
 *
 * It survived every check: on a desktop browser `vh` and `dvh` are the same
 * number, so it was invisible in dev, invisible in a headless browser at a
 * phone-sized viewport, and only visible on a real phone.
 */

const SRC = join(__dirname, "..", "..", "src")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (/\.(tsx?|css)$/.test(entry)) out.push(path)
  }
  return out
}

const files = walk(SRC)

describe("viewport heights follow the visible viewport", () => {
  it("scans something", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it("nothing uses Tailwind's screen-height helpers", () => {
    // h-screen / min-h-screen / max-h-screen all emit vh.
    const offenders = files.filter((f) =>
      /\b(?:min-|max-)?h-screen\b/.test(readFileSync(f, "utf8"))
    )
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })

  it("every vh in the stylesheet is a fallback with dvh right after it", () => {
    // Comments blanked, newlines kept so the line pairing still holds. The
    // comment above .min-h-app explains this very rule and says "100vh"
    // while doing it; a guard that trips on its own reasoning teaches the
    // next person to delete the guard.
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      (block) => block.replace(/[^\n]/g, " ")
    )
    const lines = css.split("\n")
    lines.forEach((line, i) => {
      if (!/\d\s*vh\b/.test(line)) return
      const next = lines[i + 1] ?? ""
      expect(
        /\d\s*dvh\b/.test(next),
        `"${line.trim()}" uses vh with no dvh line after it, so on a phone ` +
          `it is the large viewport and overshoots the screen.`
      ).toBe(true)
    })
  })

  // EVERY rule, not "at least one". .h-chat-screen is declared twice — once
  // for phones and once inside the md media query — and a check that passes
  // on finding any good block lets the other one lose its fallback silently.
  for (const selector of [".h-chat-screen", ".min-h-app"]) {
    it(`every ${selector} block declares dvh with a vh fallback`, () => {
      const css = readFileSync(join(SRC, "app", "globals.css"), "utf8")
      const pattern = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, "g")
      const blocks: string[] = []
      let match: RegExpExecArray | null
      while ((match = pattern.exec(css)) !== null) {
        blocks.push(match[1] as string)
      }

      expect(blocks.length, `${selector} is not defined`).toBeGreaterThan(0)
      for (const block of blocks) {
        const vh = block.indexOf("100vh")
        const dvh = block.indexOf("100dvh")
        expect(vh, `${selector} block has no vh fallback`).toBeGreaterThan(-1)
        expect(dvh, `${selector} block has no dvh`).toBeGreaterThan(-1)
        // Order matters: the fallback has to come first or it wins.
        expect(vh).toBeLessThan(dvh)
      }
    })
  }
})
