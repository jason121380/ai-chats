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

/** How the person who asked appears in the transcript the models read. */
export const HUMAN_SPEAKER_NAME = "你"

/** Something the person who asked said mid-discussion. No ledger row: it cost
 *  nothing and is not a billable model call. */
export interface DiscussionHumanTurn {
  speakerName: string
  roundNumber: number
  turnIndex: number
  content: string
  isHuman: true
}

/** Anything said in a discussion, in speaking order. */
export type DiscussionEntry = DiscussionTurn | DiscussionHumanTurn

export type DiscussionStyleName = "COLLABORATIVE" | "DEBATE"

/**
 * Picking a finished discussion back up where it stopped.
 *
 * The continuation runs through the same loop as the original — the only
 * difference is that the transcript, the round counter and the turn index
 * start from what is already in the ledger instead of from nothing. A second
 * implementation would drift from the first, and the thing it would drift on
 * is the ordering the models read.
 */
export interface DiscussionResume {
  transcript: DiscussionEntry[]
  /** The round the continuation's first turn belongs to. */
  startRound: number
  startTurnIndex: number
  /**
   * Interjection message ids already present in `transcript`.
   *
   * The loop claims a message by remembering its id in memory, which is
   * enough for one continuous run and nothing more. On a continuation that
   * memory is gone, so without this the first drain re-appends every message
   * the person ever typed — at the BOTTOM, as the most recent thing said.
   * The next speaker would then answer a question from three rounds ago
   * believing it was just asked.
   */
  seenInterjectionIds: string[]
}

export interface DiscussionConfig {
  runId: string
  sessionId: string
  question: string
  participants: CouncilModelSelection[]
  rounds: number
  /** Collaboration by default — see buildDiscussionSystemPrompt. */
  style: DiscussionStyleName
  /** Optional closing summary. A discussion may end without one. */
  summarizer: { provider: ProviderName; modelId: string } | null
  /** Set when continuing an existing discussion rather than opening one. */
  resume?: DiscussionResume
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
  | "human.said"

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
