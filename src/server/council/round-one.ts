import type { CouncilRole } from "@prisma/client"

import { executeModelRun, type ModelRouterDeps } from "@/server/ai/router"
import { emitCouncilEvent } from "./events"
import {
  buildRoundOneSystemPrompt,
  buildRoundOneUserPrompt,
} from "./prompts"
import type { CouncilConfig, StageResponse } from "./types"

export interface RoundOneResult {
  responses: StageResponse[]
  failures: number
  total: number
}

/**
 * Round 1: every selected model analyzes the question independently and in
 * parallel. Uses Promise.allSettled — one provider failing must never take
 * down the whole council.
 */
export async function runRoundOne(
  config: CouncilConfig,
  roles: Map<string, CouncilRole>,
  deps: ModelRouterDeps
): Promise<RoundOneResult> {
  const outcomes = await Promise.allSettled(
    config.models.map(async (selection) => {
      const role =
        selection.role ??
        roles.get(`${selection.provider}/${selection.modelId}`) ??
        "GENERAL"

      emitCouncilEvent({
        type: "model.started",
        runId: config.runId,
        provider: selection.provider,
        modelId: selection.modelId,
        stage: "ROUND_1",
      })

      const outcome = await executeModelRun(
        {
          sessionId: config.sessionId,
          councilRunId: config.runId,
          provider: selection.provider,
          modelId: selection.modelId,
          stage: "ROUND_1",
          role,
          systemPrompt: buildRoundOneSystemPrompt(role),
          messages: [
            { role: "user", content: buildRoundOneUserPrompt(config.question) },
          ],
        },
        deps
      )

      if (outcome.status === "COMPLETED" && outcome.response) {
        emitCouncilEvent({
          type: "model.completed",
          runId: config.runId,
          modelRunId: outcome.modelRunId,
          provider: selection.provider,
          modelId: selection.modelId,
          stage: "ROUND_1",
        })
        return {
          provider: selection.provider,
          modelId: selection.modelId,
          role,
          modelRunId: outcome.modelRunId,
          content: outcome.response.content,
        } satisfies StageResponse
      }

      emitCouncilEvent({
        type: "model.failed",
        runId: config.runId,
        modelRunId: outcome.modelRunId,
        provider: selection.provider,
        modelId: selection.modelId,
        stage: "ROUND_1",
        error: outcome.errorMessage,
      })
      throw new Error(outcome.errorMessage ?? "model failed")
    })
  )

  const responses: StageResponse[] = []
  let failures = 0
  for (const o of outcomes) {
    if (o.status === "fulfilled") responses.push(o.value)
    else failures += 1
  }

  return { responses, failures, total: config.models.length }
}
