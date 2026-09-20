/**
 * The shared secret that guards this deployment.
 *
 * Deliberately dependency-free and Edge-compatible: the middleware that
 * enforces it runs in the Edge runtime on Next 14, where `node:crypto` and
 * anything that reaches Prisma do not exist. It reads `process.env` directly
 * rather than going through `getEnv()` for the same reason — that module
 * validates the whole server environment, including a DATABASE_URL the edge
 * has no use for.
 */

/** Name of the cookie the unlock page sets. Same value as the Bearer token. */
export const SESSION_COOKIE = "app_secret"

export function getAppSecret(): string | null {
  const raw = process.env.APP_SECRET
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Constant-time comparison of a candidate against the configured secret.
 *
 * Both sides are hashed first and the fixed-length digests compared. That is
 * what makes this constant time in the way that matters: a plain `===` on the
 * raw strings returns as soon as two bytes differ, so the time it takes leaks
 * how much of a guess was right, and an attacker can recover the secret one
 * character at a time. Comparing digests also removes the length difference,
 * which a naive loop over the raw strings would still leak.
 *
 * SHA-256 via Web Crypto rather than `crypto.timingSafeEqual`, because this
 * has to run in the Edge runtime where the Node builtin is unavailable.
 */
export async function verifyAppSecret(
  candidate: string | null | undefined
): Promise<boolean> {
  const secret = getAppSecret()
  if (!secret) return false
  if (typeof candidate !== "string" || candidate.length === 0) return false

  const [a, b] = await Promise.all([sha256(candidate), sha256(secret)])
  return equalBytes(a, b)
}

async function sha256(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return new Uint8Array(digest)
}

/** Fixed-length comparison with no early exit. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}

/**
 * Pull the presented credential out of a request.
 *
 * Two carriers for one secret: `Authorization: Bearer` for scripts and curl,
 * and the cookie the unlock page sets for the browser — which is what lets
 * the existing screens keep working without a single fetch call being
 * changed, since a same-origin request sends it automatically.
 */
export function presentedSecret(req: {
  headers: { get(name: string): string | null }
  cookies: { get(name: string): { value: string } | undefined }
}): string | null {
  const header = req.headers.get("authorization")
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (match) return match[1] ?? null
  }
  return req.cookies.get(SESSION_COOKIE)?.value ?? null
}
