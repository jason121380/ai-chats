import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { middleware } from "@/middleware"
import { SESSION_COOKIE } from "@/server/auth/secret"

/**
 * The gate itself.
 *
 * Two properties are worth more than the rest and are asserted directly: a
 * route nobody thought about is CLOSED, and a page bypasses the API entirely.
 * /history/[id] renders a whole discussion from Postgres into its own HTML —
 * an API-only guard would leave every past conversation readable to anyone
 * with the URL, and nothing about that failure would surface as an error.
 */

const SECRET = "s3cret-value"
const ORIGINAL = process.env.APP_SECRET

beforeEach(() => {
  process.env.APP_SECRET = SECRET
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_SECRET
  else process.env.APP_SECRET = ORIGINAL
})

function req(path: string, init?: { bearer?: string; cookie?: string }) {
  const headers = new Headers()
  if (init?.bearer) headers.set("authorization", `Bearer ${init.bearer}`)
  if (init?.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`)
  return new NextRequest(new URL(`http://localhost${path}`), { headers })
}

/** Paths that must never be reachable without the secret. */
const GUARDED_API = [
  "/api/chat",
  "/api/compare",
  "/api/council",
  "/api/council/abc",
  "/api/council/abc/continue",
  "/api/council/abc/say",
  "/api/council/abc/stream",
  "/api/discussion",
  "/api/models",
  "/api/pricing",
  "/api/pricing/backfill",
  "/api/sessions",
  "/api/sessions/abc",
  "/api/settings/currency",
  "/api/usage/models",
  "/api/usage/runs",
  "/api/usage/summary",
]

describe("without credentials", () => {
  for (const path of GUARDED_API) {
    it(`401s ${path}`, async () => {
      const res = await middleware(req(path))
      expect(res.status).toBe(401)
    })
  }

  it("401s a route that does not exist yet", async () => {
    // The property the whole design rests on: anything not named in the
    // allowlist is closed, so a route added next month is protected by
    // omission rather than exposed by it.
    const res = await middleware(req("/api/some-future-route"))
    expect(res.status).toBe(401)
  })

  it("redirects a page to the unlock screen, and remembers where it was going", async () => {
    const res = await middleware(req("/history/abc-123?tab=cost"))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location") as string)
    expect(location.pathname).toBe("/unlock")
    expect(location.searchParams.get("next")).toBe("/history/abc-123?tab=cost")
  })

  it("does not gate the health check", async () => {
    // A health check that answers 401 gets the container restarted for being
    // unhealthy, which turns the guard into an outage.
    const res = await middleware(req("/api/health"))
    expect(res.status).toBe(200)
  })

  it("does not gate the way in", async () => {
    for (const path of ["/unlock", "/api/auth/unlock"]) {
      const res = await middleware(req(path))
      expect(res.status, `${path} must stay reachable`).toBe(200)
    }
  })

  it("does not gate Next's own assets", async () => {
    for (const path of ["/_next/static/chunk.js", "/favicon.ico"]) {
      const res = await middleware(req(path))
      expect(res.status).toBe(200)
    }
  })
})

describe("with the wrong credentials", () => {
  it("401s an API route", async () => {
    const res = await middleware(req("/api/models", { bearer: "wrong" }))
    expect(res.status).toBe(401)
  })

  it("401s a cookie that is close but not equal", async () => {
    const res = await middleware(req("/api/models", { cookie: "s3cret-valu" }))
    expect(res.status).toBe(401)
  })
})

describe("with the right credentials", () => {
  it("lets a Bearer token through", async () => {
    const res = await middleware(req("/api/models", { bearer: SECRET }))
    expect(res.status).toBe(200)
  })

  it("lets the cookie through, which is what the existing UI uses", async () => {
    const res = await middleware(req("/api/sessions", { cookie: SECRET }))
    expect(res.status).toBe(200)
  })

  it("lets a page through", async () => {
    const res = await middleware(req("/history/abc", { cookie: SECRET }))
    expect(res.status).toBe(200)
  })
})

describe("when the server has no secret configured", () => {
  beforeEach(() => {
    delete process.env.APP_SECRET
  })

  it("refuses API traffic rather than serving it open", async () => {
    // Production cannot reach this state — the env check refuses to boot —
    // so this is development, where the absence should be loud and cheap
    // rather than silent and open.
    const res = await middleware(req("/api/models"))
    expect(res.status).toBe(503)
  })

  it("still lets the developer see their own pages", async () => {
    const res = await middleware(req("/history/abc"))
    expect(res.status).toBe(200)
  })
})
