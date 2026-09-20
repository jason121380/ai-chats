import { NextResponse, type NextRequest } from "next/server"

import { getAppSecret, presentedSecret, verifyAppSecret } from "@/server/auth/secret"

/**
 * Everything is closed unless this file says otherwise.
 *
 * The alternative — a check at the top of each route handler — was rejected
 * on one property: with eighteen routes today and more later, the default for
 * anything new is OPEN, and the failure is silent. A route added next month
 * that nobody remembers to guard spends money on model calls and hands out
 * other people's conversations, and nothing about it looks wrong. Here the
 * default is CLOSED: forgetting to touch this file leaves a new route
 * protected, and the mistake shows up immediately as a 401 rather than
 * eventually as a bill.
 *
 * It also covers what a per-route check structurally cannot. /history/[id] is
 * a server component that reads Postgres directly and renders the whole
 * discussion into its HTML — it never touches an API route, so an API-only
 * guard would leave every past conversation readable to anyone with the URL.
 * Pages are gated here too, redirected to the unlock screen rather than
 * answered with a 401, because a person who lands on one wants a way in and
 * not a status code.
 */

/** Open to anyone. Every entry is a decision; keep the list short. */
const PUBLIC_PATHS = new Set([
  // Liveness. Deployment platforms poll it without credentials, and a health
  // check that needs a secret gets the container restarted for being 401.
  "/api/health",
  // The way in. Gating it would be a locked door with the key inside.
  "/unlock",
  "/api/auth/unlock",
])

/**
 * Next's own assets and the favicon. Not secrets, and the unlock page cannot
 * render without them.
 */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  )
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized: missing or invalid credentials" },
    { status: 401 }
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicAsset(pathname) || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const isApi = pathname.startsWith("/api/")

  // No secret configured. Production cannot reach this — the environment
  // check refuses to start without one — so this is development, where
  // demanding a secret nobody set would just lock the developer out of their
  // own app. Refuse API traffic anyway rather than serving it silently open,
  // so the absence is noticed while it is still cheap.
  if (!getAppSecret()) {
    if (isApi) {
      return NextResponse.json(
        { error: "APP_SECRET is not configured on the server" },
        { status: 503 }
      )
    }
    return NextResponse.next()
  }

  if (await verifyAppSecret(presentedSecret(req))) {
    return NextResponse.next()
  }

  if (isApi) return unauthorized()

  const to = req.nextUrl.clone()
  to.pathname = "/unlock"
  to.search = ""
  // Where they were headed, so unlocking lands them there instead of at the
  // top. `pathname + search` only — never an absolute URL from the request,
  // which would let a crafted link bounce someone off-site after unlocking.
  to.searchParams.set("next", pathname + req.nextUrl.search)
  return NextResponse.redirect(to)
}

export const config = {
  /**
   * Everything except Next's build output and the favicon. Written as an
   * exclusion rather than a list of protected paths for the same reason as
   * above: a new route joins the protected set by existing.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
