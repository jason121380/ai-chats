import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { SESSION_COOKIE, verifyAppSecret } from "@/server/auth/secret"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ secret: z.string().min(1) })

/** Thirty days. Long enough not to be a nuisance, short enough to expire. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/**
 * Exchange the secret for a cookie.
 *
 * The cookie holds the secret itself, which is worth stating plainly: it is
 * exactly as sensitive as the Bearer token, and anyone who can read it is
 * authenticated. `httpOnly` keeps it away from page JavaScript, so an XSS bug
 * cannot lift it; `secure` keeps it off plaintext connections; `sameSite:
 * lax` keeps another site from riding it on a cross-site POST.
 *
 * It is not a session in any richer sense — there is no per-user identity
 * here to track. One shared secret, one deployment, one door.
 */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing secret" }, { status: 400 })
  }

  if (!(await verifyAppSecret(parsed.data.secret))) {
    // Deliberately not "wrong secret" versus "no secret configured": the
    // difference is only useful to someone guessing.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: SESSION_COOKIE,
    value: parsed.data.secret,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
  return res
}

/** Sign out: drop the cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
