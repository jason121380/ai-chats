import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  SESSION_COOKIE,
  getAppSecret,
  presentedSecret,
  verifyAppSecret,
} from "@/server/auth/secret"
import { resetEnvCache } from "@/lib/env"

const ORIGINAL = process.env.APP_SECRET

beforeEach(() => {
  process.env.APP_SECRET = "s3cret-value"
  resetEnvCache()
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_SECRET
  else process.env.APP_SECRET = ORIGINAL
  resetEnvCache()
})

/** Minimal stand-in for the parts of NextRequest the helper reads. */
function requestWith(opts: { bearer?: string; cookie?: string }) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" && opts.bearer
          ? `Bearer ${opts.bearer}`
          : null,
    },
    cookies: {
      get: (name: string) =>
        name === SESSION_COOKIE && opts.cookie
          ? { value: opts.cookie }
          : undefined,
    },
  }
}

describe("the configured secret", () => {
  it("is whatever is in the environment", () => {
    expect(getAppSecret()).toBe("s3cret-value")
  })

  it("treats blank and whitespace as not configured", () => {
    // An empty variable is how a secret goes missing in practice — a name
    // exported with nothing after the equals sign. Reading that as a valid
    // secret would mean the empty string unlocks the app.
    for (const blank of ["", "   ", "\n"]) {
      process.env.APP_SECRET = blank
      expect(getAppSecret()).toBeNull()
    }
  })
})

describe("verifying a presented secret", () => {
  it("accepts the right one", async () => {
    await expect(verifyAppSecret("s3cret-value")).resolves.toBe(true)
  })

  it("rejects a wrong one, a prefix, and an extension", async () => {
    for (const wrong of ["nope", "s3cret-valu", "s3cret-value ", "S3CRET-VALUE"]) {
      await expect(verifyAppSecret(wrong)).resolves.toBe(false)
    }
  })

  it("rejects nothing at all", async () => {
    await expect(verifyAppSecret(null)).resolves.toBe(false)
    await expect(verifyAppSecret(undefined)).resolves.toBe(false)
    await expect(verifyAppSecret("")).resolves.toBe(false)
  })

  it("never authenticates when the server has no secret", async () => {
    // Including against the empty string, which is what an unset variable
    // would compare equal to under a careless implementation.
    process.env.APP_SECRET = ""
    await expect(verifyAppSecret("")).resolves.toBe(false)
    await expect(verifyAppSecret("anything")).resolves.toBe(false)
  })
})

describe("reading the credential off a request", () => {
  it("takes a Bearer header", () => {
    expect(presentedSecret(requestWith({ bearer: "abc" }))).toBe("abc")
  })

  it("takes the cookie", () => {
    expect(presentedSecret(requestWith({ cookie: "abc" }))).toBe("abc")
  })

  it("prefers the header, so curl can override a stale cookie", () => {
    expect(
      presentedSecret(requestWith({ bearer: "from-header", cookie: "from-cookie" }))
    ).toBe("from-header")
  })

  it("is null when neither is present", () => {
    expect(presentedSecret(requestWith({}))).toBeNull()
  })
})

/**
 * The constant-time property is not observable from behaviour.
 *
 * Replacing the digest comparison with `candidate === secret` passes every
 * test above — because the two are behaviourally identical. The whole
 * difference is how long a wrong guess takes to reject, and a unit test that
 * tried to measure microseconds on a shared CI runner would be flaky in the
 * direction that gets tests deleted.
 *
 * So this is a source check rather than a behavioural one, and says so. It
 * pins a decision that cannot otherwise be defended: an `===` on the secret
 * returns as soon as two bytes differ, which leaks how much of a guess was
 * right and lets an attacker recover the secret one character at a time.
 */
describe("the comparison is constant time", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "src", "server", "auth", "secret.ts"),
    "utf8"
  )

  it("never compares the secret with === or !==", () => {
    const offending = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*"))
      .filter((line) => /(===|!==)/.test(line) && /secret|candidate/i.test(line))
      // Guard clauses on type and emptiness are not comparisons of the value
      // against the secret, and they run before any comparison happens.
      .filter((line) => !/typeof|\.length|null|undefined/.test(line))
    expect(offending).toEqual([])
  })

  it("compares fixed-length digests, so length is not leaked either", () => {
    expect(source).toContain('crypto.subtle.digest("SHA-256"')
    // No early exit: the loop XORs every byte and decides at the end.
    expect(source).toMatch(/diff \|=/)
    expect(source).toMatch(/return diff === 0/)
  })
})
