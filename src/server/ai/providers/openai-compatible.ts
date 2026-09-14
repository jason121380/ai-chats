import type {
  AIRequest,
  AIResponse,
  FetchFn,
} from "../types"
import { ProviderError, providerErrorFromHttp } from "../types"
import { normalizeOpenAIUsage } from "../normalize-usage"

/**
 * Shared implementation for OpenAI-compatible chat-completions APIs
 * (OpenAI itself and xAI). Handles request translation, response translation,
 * usage normalization, provider errors, request IDs and finish reason —
 * and nothing else. No council logic, no cost math, no database access.
 */
export interface OpenAICompatibleOptions {
  baseUrl: string
  apiKey: string
  fetchFn?: FetchFn
  /** Name of the max-tokens parameter, which differs between vendors. */
  maxTokensParam?: "max_tokens" | "max_completion_tokens"
}

export async function generateOpenAICompatible(
  request: AIRequest,
  options: OpenAICompatibleOptions
): Promise<AIResponse> {
  const fetchFn = options.fetchFn ?? fetch
  const maxTokensParam = options.maxTokensParam ?? "max_tokens"

  const messages: Array<{ role: string; content: string }> = []
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt })
  }
  for (const m of request.messages) {
    messages.push({ role: m.role, content: m.content })
  }

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
  }
  if (request.temperature !== undefined) body.temperature = request.temperature
  if (request.maxOutputTokens !== undefined) {
    body[maxTokensParam] = request.maxOutputTokens
  }

  let res: Response
  try {
    res = await fetchFn(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal ?? null,
    })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err
    throw new ProviderError(`Network error: ${String(err)}`, {
      code: "NETWORK",
      cause: err,
    })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw providerErrorFromHttp(res.status, text)
  }

  const json = (await res.json()) as {
    id?: string
    choices?: Array<{
      message?: { content?: string | null }
      finish_reason?: string
    }>
    usage?: unknown
    model?: string
  }

  const choice = json.choices?.[0]
  if (!choice) {
    throw new ProviderError("Provider returned no choices", {
      code: "UNKNOWN",
      retryable: false,
    })
  }

  return {
    content: choice.message?.content ?? "",
    usage: normalizeOpenAIUsage(json.usage ?? null),
    providerRequestId: json.id,
    finishReason: choice.finish_reason,
    metadata: { model: json.model },
  }
}
