import type { CouncilRole, ProviderName } from "@prisma/client"

export interface CouncilModelSelection {
  provider: ProviderName
  modelId: string
  role?: CouncilRole
}

export interface CouncilConfig {
  runId: string
  sessionId: string
  question: string
  models: CouncilModelSelection[]
  chairman: { provider: ProviderName; modelId: string }
}

/** A successful stage output, still tied to its ledger row. */
export interface StageResponse {
  provider: ProviderName
  modelId: string
  role: CouncilRole
  modelRunId: string
  content: string
}

/** Anonymous label ("A", "B", ...) assigned to a Round 1 response. */
export interface LabeledResponse extends StageResponse {
  label: string
}

/** One thing somebody said in a Discussion, in speaking order. */
export interface DiscussionTurn {
  provider: ProviderName
  modelId: string
  speakerName: string
  role: CouncilRole
  modelRunId: string
  roundNumber: number
  turnIndex: number
  content: string
}

export interface DiscussionConfig {
  runId: string
  sessionId: string
  question: string
  participants: CouncilModelSelection[]
  rounds: number
  /** Optional closing summary. A discussion may end without one. */
  summarizer: { provider: ProviderName; modelId: string } | null
}

export type CouncilEventType =
  | "council.started"
  | "stage.started"
  | "model.started"
  | "model.delta"
  | "model.completed"
  | "model.failed"
  | "stage.completed"
  | "chairman.started"
  | "chairman.delta"
  | "chairman.completed"
  | "council.completed"
  | "council.failed"
  | "round.started"
  | "round.completed"

export interface CouncilEvent {
  type: CouncilEventType
  runId: string
  modelRunId?: string
  provider?: ProviderName
  modelId?: string
  stage?: string
  status?: string
  delta?: string
  error?: string
  roundNumber?: number
  turnIndex?: number
  timestamp: string
}
