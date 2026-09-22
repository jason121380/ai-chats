import { z } from "zod"

/**
 * Server-side environment validation.
 *
 * This module must only ever be imported from server code (src/server/*,
 * API routes, server components). API keys never reach the browser bundle.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  /**
   * The shared secret that guards the whole deployment. Optional in
   * development and tests, mandatory in production — see the refinement
   * below, which turns a missing one into a refusal to start.
   */
  APP_SECRET: z.string().optional(),

  NODE_ENV: z.string().optional(),

  // Provider request timeout (ms). Central server config — not scattered hardcodes.
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // A run stuck in a non-terminal state longer than this is considered stale.
  COUNCIL_STALE_AFTER_MS: z.coerce.number().int().positive().default(15 * 60_000),
})
  /**
   * Production must not start without a secret.
   *
   * Refusing to boot is the point. The alternative — starting up and serving
   * everything open — is a deployment that looks completely healthy while
   * anyone who finds the URL can spend money on model calls and read every
   * past conversation. A container that will not start gets noticed in
   * minutes; an open one gets noticed when the bill arrives.
   */
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return
    if (typeof env.APP_SECRET === "string" && env.APP_SECRET.trim().length > 0) {
      return
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_SECRET"],
      message:
        "APP_SECRET is required in production — the app refuses to start " +
        "without it rather than serve every route unauthenticated",
    })
  })

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid environment configuration: ${issues}`)
  }
  cached = parsed.data
  return cached
}

/** Test helper — clears the memoized env. */
export function resetEnvCache(): void {
  cached = null
}
