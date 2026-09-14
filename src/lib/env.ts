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

  APP_SECRET: z.string().optional(),

  // Provider request timeout (ms). Central server config — not scattered hardcodes.
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // A run stuck in a non-terminal state longer than this is considered stale.
  COUNCIL_STALE_AFTER_MS: z.coerce.number().int().positive().default(15 * 60_000),
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
