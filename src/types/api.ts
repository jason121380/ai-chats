/** Client-side shapes of API responses (serialized JSON — Decimals are strings). */

export interface ModelConfigDto {
  id: string
  provider: string
  modelId: string
  displayName: string
  enabled: boolean
  supportsStreaming: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  defaultRole: string
  sortOrder: number
  temperature: number | null
  maxOutputTokens: number | null
  providerConfigured: boolean
  pricingConfigured: boolean
}

export interface ModelRunDto {
  id: string
  councilRunId?: string | null
  provider: string
  modelId: string
  stage: string
  role: string
  status: string
  roundNumber?: number | null
  turnIndex?: number | null
  response?: string | null
  latencyMs: number | null
  attemptCount?: number
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
  inputCostUsd?: string | null
  outputCostUsd?: string | null
  totalCostUsd: string | null
  pricingStatus: string
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt?: string
}

/** Something the person typed mid-discussion. */
export interface InterjectionDto {
  id: string
  content: string
  createdAt: string
}

export interface CouncilRunDto {
  id: string
  sessionId: string
  kind: string
  status: string
  currentStage: string | null
  totalRounds: number | null
  currentRound: number | null
  chairmanProvider: string | null
  chairmanModel: string | null
  startedAt: string | null
  completedAt: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCachedInputTokens: number
  totalReasoningTokens: number
  totalTokens: number
  totalCostUsd: string | null
  totalLatencyMs: number | null
  errorMessage: string | null
  interjections?: InterjectionDto[]
  createdAt: string
  modelRuns: ModelRunDto[]
  finalAnswer: string | null
}

export interface SessionDto {
  id: string
  title: string
  mode: string
  status: string
  createdAt: string
  updatedAt: string
  totalTokens?: number
  totalCostUsd?: string | null
  modelCalls?: number
}

export interface MessageDto {
  id: string
  role: string
  source: string
  content: string
  modelRunId: string | null
  createdAt: string
}

export interface SessionDetailDto extends SessionDto {
  messages: MessageDto[]
  councilRuns: Array<Omit<CouncilRunDto, "modelRuns" | "finalAnswer">>
  /** ModelRun rows for the whole session, council and standalone alike. */
  modelRuns: ModelRunDto[]
  cost: {
    totalTokens: number
    totalCostUsd: string | null
    modelCalls: number
  }
}

export interface UsageSummaryDto {
  calls: number
  successfulCalls: number
  failedCalls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  totalTokens: number
  totalCostUsd: string
  averageLatencyMs: number | null
}

export interface ModelUsageRowDto {
  provider: string
  modelId: string
  calls: number
  successfulCalls: number
  failedCalls: number
  successRate: number | null
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  totalTokens: number
  inputCostUsd: string
  outputCostUsd: string
  totalCostUsd: string
  averageCostPerCallUsd: string | null
  averageLatencyMs: number | null
}

export interface PricingRowDto {
  id: string
  provider: string
  modelId: string
  currency: string
  inputPerMillion: string
  outputPerMillion: string
  cachedInputPerMillion: string | null
  reasoningPerMillion: string | null
  effectiveFrom: string
  effectiveTo: string | null
  source: string | null
}

export const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google",
  XAI: "xAI",
  MUSE: "Muse",
  SPARK: "Spark",
}

export const ROLE_LABELS: Record<string, string> = {
  STRATEGIST: "策略顧問",
  RISK_ANALYST: "風險分析",
  RESEARCHER: "研究調查",
  DEVILS_ADVOCATE: "反方辯士",
  CREATIVE: "創意發想",
  EXECUTION: "執行落地",
  CHAIRMAN: "主席",
  GENERAL: "一般",
}
