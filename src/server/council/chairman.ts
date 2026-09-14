import { executeModelRun, type ModelRouterDeps } from "@/server/ai/router"
import { emitCouncilEvent } from "./events"
import {
  buildChairmanSystemPrompt,
  buildChairmanUserPrompt,
} from "./prompts"
import type { CouncilConfig, LabeledResponse } from "./types"

export interface ChairmanResult {
  modelRunId: string
  content: string | null
  failed: boolean
  errorMessage?: string
}

/**
 * Chairman stage: the user-selected chairman model integrates the original
 * question, anonymous Round 1 responses and anonymous critiques into a final
 * structured decision.
 */
export async function runChairman(
  config: CouncilConfig,
  roundOne: LabeledResponse[],
  critiques: LabeledResponse[],
  deps: ModelRouterDeps
): Promise<ChairmanResult> {
  emitCouncilEvent({
    type: "chairman.started",
    runId: config.runId,
    provider: config.chairman.provider,
    modelId: config.chairman.modelId,
    stage: "CHAIRMAN",
  })

  const outcome = await executeModelRun(
    {
      sessionId: config.sessionId,
      councilRunId: config.runId,
      provider: config.chairman.provider,
      modelId: config.chairman.modelId,
      stage: "CHAIRMAN",
      role: "CHAIRMAN",
      systemPrompt: buildChairmanSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildChairmanUserPrompt(config.question, roundOne, critiques),
        },
      ],
    },
    deps
  )

  if (outcome.status === "COMPLETED" && outcome.response) {
    emitCouncilEvent({
      type: "chairman.completed",
      runId: config.runId,
      modelRunId: outcome.modelRunId,
      provider: config.chairman.provider,
      modelId: config.chairman.modelId,
      stage: "CHAIRMAN",
    })
    return {
      modelRunId: outcome.modelRunId,
      content: outcome.response.content,
      failed: false,
    }
  }

  emitCouncilEvent({
    type: "model.failed",
    runId: config.runId,
    modelRunId: outcome.modelRunId,
    provider: config.chairman.provider,
    modelId: config.chairman.modelId,
    stage: "CHAIRMAN",
    error: outcome.errorMessage,
  })
  return {
    modelRunId: outcome.modelRunId,
    content: null,
    failed: true,
    errorMessage: outcome.errorMessage,
  }
}
