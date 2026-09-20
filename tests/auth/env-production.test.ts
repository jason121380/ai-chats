import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getEnv, resetEnvCache } from "@/lib/env"

/**
 * Production refuses to start without a secret.
 *
 * Refusing to boot is the whole point. The alternative is a deployment that
 * reports itself perfectly healthy while every route is open: anyone who
 * finds the URL can spend money on model calls and read every past
 * conversation. A container that will not start is noticed in minutes. An
 * open one is noticed when the bill arrives.
 */

const saved = { ...process.env }

/**
 * NODE_ENV is typed readonly, so plain assignment fails the typecheck even
 * though it works at runtime. Defining the property is the honest way to set
 * it for a test rather than casting the type away.
 */
function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db"
  resetEnvCache()
})

afterEach(() => {
  process.env = { ...saved }
  resetEnvCache()
})

describe("in production", () => {
  beforeEach(() => {
    setNodeEnv("production")
  })

  it("refuses to start with no APP_SECRET", () => {
    delete process.env.APP_SECRET
    expect(() => getEnv()).toThrow(/APP_SECRET/)
  })

  it("refuses to start with an empty APP_SECRET", () => {
    // How it actually goes missing: the name is exported with nothing after
    // the equals sign, which a presence check would happily accept.
    for (const blank of ["", "   "]) {
      process.env.APP_SECRET = blank
      resetEnvCache()
      expect(() => getEnv(), `"${blank}" must not count`).toThrow(/APP_SECRET/)
    }
  })

  it("starts with one set", () => {
    process.env.APP_SECRET = "s3cret-value"
    expect(getEnv().APP_SECRET).toBe("s3cret-value")
  })
})

describe("outside production", () => {
  it("starts without one, so a developer is not locked out of their own app", () => {
    setNodeEnv("development")
    delete process.env.APP_SECRET
    expect(() => getEnv()).not.toThrow()
  })
})
