import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, FetchFn } from "../types"
import { ProviderError, providerErrorFromHttp } from "../types"
import { normalizeGeminiUsage } from "../normalize-usage"

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
}
