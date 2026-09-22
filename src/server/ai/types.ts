/**
 * Provider-agnostic AI types. The Council Engine and all API routes operate
 * exclusively on these — never on raw provider SDK responses.
 */

export const PROVIDER_NAMES = [
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "XAI",
  "MUSE",
  "SPARK",
  "OPENROUTER",
] as const

export type ProviderName = (typeof PROVIDER_NAMES)[number]

export interface NormalizedUsage {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null

  cachedInputTokens: number | null
  reasoningTokens: number | null

  rawUsage: unknown
}

export interface AIMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export interface AIRequest {
  model: string

  messages: AIMessage[]

  systemPrompt?: string

  temperature?: number

  maxOutputTokens?: number

  signal?: AbortSignal
}

export interface AIResponse {
  content: string

  usage: NormalizedUsage

  providerRequestId?: string

  finishReason?: string

  metadata?: Record<string, unknown>
}

export interface AIStreamEvent {
  type: "delta" | "done"
  delta?: string
  response?: AIResponse
}

export type ProviderErrorCode =
  | "RATE_LIMITED"
  | "AUTH"
  | "INVALID_REQUEST"
  | "SERVER_ERROR"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN"

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly httpStatus?: number
  readonly retryable: boolean

  constructor(
    message: string,
    options: {
      code: ProviderErrorCode
      httpStatus?: number
      retryable?: boolean
      cause?: unknown
    }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = "ProviderError"
    this.code = options.code
    this.httpStatus = options.httpStatus
    this.retryable =
      options.retryable ??
      (options.code === "RATE_LIMITED" ||
        options.code === "SERVER_ERROR" ||
        options.code === "NETWORK")
  }
}

/** Classify an HTTP status into a ProviderError. */
export function providerErrorFromHttp(
  status: number,
  body: string
): ProviderError {
  const summary = body.slice(0, 500)
  if (status === 429) {
    return new ProviderError(`Rate limited (429): ${summary}`, {
      code: "RATE_LIMITED",
      httpStatus: status,
    })
  }
  if (status === 401 || status === 403) {
    return new ProviderError(`Authentication failed (${status}): ${summary}`, {
      code: "AUTH",
      httpStatus: status,
      retryable: false,
    })
  }
  if (status >= 500) {
    return new ProviderError(`Provider server error (${status}): ${summary}`, {
      code: "SERVER_ERROR",
      httpStatus: status,
    })
  }
  if (status >= 400) {
    return new ProviderError(`Invalid request (${status}): ${summary}`, {
      code: "INVALID_REQUEST",
      httpStatus: status,
      retryable: false,
    })
  }
  return new ProviderError(`Unexpected HTTP status ${status}: ${summary}`, {
    code: "UNKNOWN",
    httpStatus: status,
    retryable: false,
  })
}

/** Fetch-compatible function type so adapters can be tested with mocks. */
export type FetchFn = typeof fetch
