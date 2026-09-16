import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A page or layout that reads the database must not be statically rendered.
 *
 * This is the bug this test exists for, and it was shipped: the root layout
 * reads the display currency, and Next prerendered it at BUILD time. The
 * build has no database — the Dockerfile passes a placeholder DATABASE_URL,
 * because `next build` imports route modules that validate the variable at
 * import — so the read failed, the "nothing configured" fallback was baked
 * into the static HTML, and /usage and /history showed US$ forever no matter
 * what rate was set afterwards.
 *
 * Nothing about it looked wrong. The build passed, every test passed, the
 * feature worked perfectly in `next dev` (which renders everything per
 * request), and the one page that happened to be dynamic — /history/[id],
 * dynamic only because it has a route parameter — showed the right currency.
 *
 * So the rule is structural: read the database in a page or layout, and say
 * out loud that it cannot be prerendered.
 */

const APP_DIR = join(__dirname, "..", "..", "src", "app")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
    } else if (/^(page|layout|template)\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

/**
 * Reaches the database, directly or through a server module that does.
 *
 * Any import from @/server is server-side work, and in this codebase that
 * means Prisma sooner or later. Naming specific modules meant a page that
 * reached the database through a NEW one — which is what happened when the
 * session detail moved to a server component — was not covered by the guard
 * at all.
 */
function readsDatabase(source: string): boolean {
  return /from "@\/server\//.test(source)
}

function optsOutOfPrerender(source: string): boolean {
  return /export const dynamic\s*=\s*["'](force-dynamic|error)["']/.test(source)
}

describe("pages that read the database are rendered per request", () => {
  const files = walk(APP_DIR)

  it("finds the app router files at all", () => {
    // Guards the guard: a walk that silently matched nothing would make every
    // assertion below vacuously true.
    expect(files.length).toBeGreaterThan(3)
    expect(files.some((f) => f.endsWith("layout.tsx"))).toBe(true)
  })

  for (const file of files) {
    const source = readFileSync(file, "utf8")
    if (!readsDatabase(source)) continue
    const name = file.slice(APP_DIR.length + 1)
    it(`${name} opts out of static prerendering`, () => {
      expect(
        optsOutOfPrerender(source),
        `${name} reads the database but may be prerendered at build time, ` +
          `where there is none — it would bake in whatever the failure ` +
          `fallback produces and serve that forever.`
      ).toBe(true)
    })
  }

  it("covers the root layout specifically", () => {
    const source = readFileSync(join(APP_DIR, "layout.tsx"), "utf8")
    expect(readsDatabase(source)).toBe(true)
    expect(optsOutOfPrerender(source)).toBe(true)
  })
})
