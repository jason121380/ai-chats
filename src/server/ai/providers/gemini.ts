import type { AIProvider } from "../provider"
import type {
  AIRequest,
  AIResponse,
  AIStreamEvent,
  FetchFn,
} from "../types"
import { networkError, ProviderError, providerErrorFromHttp } from "../types"
import { normalizeGeminiUsage } from "../normalize-usage"
import { parseSseJson, readSseData } from "./sse"

export interface GeminiProviderOptions {
  apiKey: string
  baseUrl?: string
  fetchFn?: FetchFn
}

export class GeminiProvider implements AIProvider {
  readonly provider = "GOOGLE" as const

  private readonly options: GeminiProviderOptions

  constructor(options: GeminiProviderOptions) {
    this.options = options
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const fetchFn = this.options.fetchFn ?? fetch
    const baseUrl =
      this.options.baseUrl ?? "https://generativelanguage.googleapis.com"

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }))

    const generationConfig: Record<string, unknown> = {}
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature
    }
    if (request.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxOutputTokens
    }

    const body: Record<string, unknown> = { contents }
    if (request.systemPrompt) {
      body.systemInstruction = { parts: [{ text: request.systemPrompt }] }
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig
    }

    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(
      request.model
    )}:generateContent`

    let res: Response
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.options.apiKey,
        },
        body: JSON.stringify(body),
        signal: request.signal ?? null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err
      throw networkError(err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw providerErrorFromHttp(res.status, text)
    }

    const json = (await res.json()) as {
      responseId?: string
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
        finishReason?: string
      }>
      usageMetadata?: unknown
      modelVersion?: string
    }

    const candidate = json.candidates?.[0]
    if (!candidate) {
      throw new ProviderError("Gemini returned no candidates", {
        code: "UNKNOWN",
        retryable: false,
      })
    }

    const content = (candidate.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")

    return {
      content,
      usage: normalizeGeminiUsage(json.usageMetadata ?? null),
      providerRequestId: json.responseId,
      finishReason: candidate.finishReason,
      metadata: { model: json.modelVersion },
    }
  }

  /**
   * The same call against `streamGenerateContent`.
   *
   * `alt=sse` is not optional. Without it Gemini streams a JSON ARRAY in
   * chunks — valid JSON overall, but not parseable a piece at a time, so the
   * shared SSE reader would find no `data:` lines and the turn would arrive
   * as one silent block at the end. With it, each chunk is its own event.
   *
   * usageMetadata is cumulative on every chunk, so the last one that carries
   * it wins rather than being summed.
   */
  async *stream(request: AIRequest): AsyncGenerator<AIStreamEvent> {
    const fetchFn = this.options.fetchFn ?? fetch
    const baseUrl =
      this.options.baseUrl ?? "https://generativelanguage.googleapis.com"

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }))

    const generationConfig: Record<string, unknown> = {}
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature
    }
    if (request.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxOutputTokens
    }

    const body: Record<string, unknown> = { contents }
    if (request.systemPrompt) {
      body.systemInstruction = { parts: [{ text: request.systemPrompt }] }
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig
    }

    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(
      request.model
    )}:streamGenerateContent?alt=sse`

    let res: Response
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.options.apiKey,
        },
        body: JSON.stringify(body),
        signal: request.signal ?? null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err
      throw networkError(err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw providerErrorFromHttp(res.status, text)
    }
    if (!res.body) {
      throw new ProviderError("Gemini returned no stream body", {
        code: "UNKNOWN",
        retryable: false,
      })
    }

    let content = ""
    let responseId: string | undefined
    let modelVersion: string | undefined
    let finishReason: string | undefined
    let usageMetadata: unknown = null

    for await (const payload of readSseData(res.body)) {
      const chunk = parseSseJson<{
        responseId?: string
        modelVersion?: string
        usageMetadata?: unknown
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> }
          finishReason?: string
        }>
      }>(payload)
      if (!chunk) continue

      if (chunk.responseId) responseId = chunk.responseId
      if (chunk.modelVersion) modelVersion = chunk.modelVersion
      if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata

      const candidate = chunk.candidates?.[0]
      if (candidate?.finishReason) finishReason = candidate.finishReason
      const delta = (candidate?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
      if (delta) {
        content += delta
        yield { type: "delta", delta }
      }
    }

    yield {
      type: "done",
      response: {
        content,
        usage: normalizeGeminiUsage(usageMetadata),
        providerRequestId: responseId,
        finishReason,
        metadata: { model: modelVersion },
      },
    }
  }
}
