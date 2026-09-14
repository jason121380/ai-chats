import { executeModelRun, type ModelRouterDeps } from "@/server/ai/router"
import { emitCouncilEvent } from "./events"
import { buildCritiqueSystemPrompt, buildCritiqueUserPrompt } from "./prompts"
import type {
  CouncilConfig,
  LabeledResponse,
  StageResponse,
} from "./types"

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/** Assign anonymous labels (Response A, B, ...) to successful responses. */
export function anonymize(responses: StageResponse[]): LabeledResponse[] {
  return responses.map((r, i) => ({ ...r, label: LABELS[i] ?? `#${i + 1}` }))
}

/** Minimum successful Round 1 responses for a critique round to make sense. */
export const MIN_RESPONSES_FOR_CRITIQUE = 2

export interface CritiqueResult {
  critiques: LabeledResponse[]
  failures: number
  skipped: boolean
}

/**
 * Critique round: every model that succeeded in Round 1 reviews all
 * anonymized responses in parallel. Identities are never revealed —
 * prompts only ever say "Response A/B/C...".
 */
export async function runCritique(
  config: CouncilConfig,
  labeled: LabeledResponse[],
  deps: ModelRouterDeps
): Promise<CritiqueResult> {
  if (labeled.length < MIN_RESPONSES_FOR_CRITIQUE) {
    return { critiques: [], failures: 0, skipped: true }
  }

  const outcomes = await Promise.allSettled(
    labeled.map(async (member) => {
      emitCouncilEvent({
        type: "model.started",
        runId: config.runId,
        provider: member.provider,
        modelId: member.modelId,
        stage: "CRITIQUE",
      })

      const outcome = await executeModelRun(
        {
          sessionId: config.sessionId,
          councilRunId: config.runId,
          provider: member.provider,
          modelId: member.modelId,
          stage: "CRITIQUE",
          role: member.role,
          systemPrompt: buildCritiqueSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildCritiqueUserPrompt(config.question, labeled),
            },
          ],
        },
        deps
      )

      if (outcome.status === "COMPLETED" && outcome.response) {
        emitCouncilEvent({
          type: "model.completed",
          runId: config.runId,
          modelRunId: outcome.modelRunId,
          provider: member.provider,
          modelId: member.modelId,
          stage: "CRITIQUE",
        })
        return {
          ...member,
          modelRunId: outcome.modelRunId,
          content: outcome.response.content,
        } satisfies LabeledResponse
      }

      emitCouncilEvent({
        type: "model.failed",
        runId: config.runId,
        modelRunId: outcome.modelRunId,
        provider: member.provider,
        modelId: member.modelId,
        stage: "CRITIQUE",
        error: outcome.errorMessage,
      })
      throw new Error(outcome.errorMessage ?? "critique failed")
    })
  )

  const critiques: LabeledResponse[] = []
  let failures = 0
  for (const o of outcomes) {
    if (o.status === "fulfilled") critiques.push(o.value)
    else failures += 1
  }

  return { critiques, failures, skipped: false }
}
