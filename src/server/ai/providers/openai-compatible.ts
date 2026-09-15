import type {
  AIRequest,
  AIResponse,
  AIStreamEvent,
  FetchFn,
} from "../types"
import { ProviderError, providerErrorFromHttp } from "../types"
import { normalizeOpenAIUsage } from "../normalize-usage"
import { parseSseJson, readSseData } from "./sse"

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

interface StreamChunk {
  id?: string
  model?: string
  choices?: Array<{
    delta?: { content?: string | null }
    finish_reason?: string | null
  }>
  usage?: unknown
}

/**
 * The same call with `stream: true`.
 *
 * Deliberately a separate function rather than a flag on the one above: the
 * two differ in where every field comes from (content arrives in deltas,
 * usage only in the final chunk), and folding them together would mean a
 * branch in every field extraction.
 *
 * `stream_options.include_usage` is what makes the last chunk carry token
 * counts. Without it a streamed call would produce no usage, and the cost
 * ledger would silently record every streamed turn as unpriceable — a
 * reporting hole opened by a display feature.
 */
export async function* streamOpenAICompatible(
  request: AIRequest,
  options: OpenAICompatibleOptions
): AsyncGenerator<AIStreamEvent> {
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
    stream: true,
    stream_options: { include_usage: true },
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
  if (!res.body) {
    throw new ProviderError("Provider returned no stream body", {
      code: "UNKNOWN",
      retryable: false,
    })
  }

  let content = ""
  let usage: unknown = null
  let requestId: string | undefined
  let model: string | undefined
  let finishReason: string | undefined

  for await (const payload of readSseData(res.body)) {
    if (payload === "[DONE]") break
    const chunk = parseSseJson<StreamChunk>(payload)
    if (!chunk) continue
    if (chunk.id) requestId = chunk.id
    if (chunk.model) model = chunk.model
    if (chunk.usage) usage = chunk.usage
    const choice = chunk.choices?.[0]
    if (choice?.finish_reason) finishReason = choice.finish_reason
    const delta = choice?.delta?.content
    if (delta) {
      content += delta
      yield { type: "delta", delta }
    }
  }

  yield {
    type: "done",
    response: {
      content,
      usage: normalizeOpenAIUsage(usage),
      providerRequestId: requestId,
      finishReason,
      metadata: { model },
    },
  }
}
