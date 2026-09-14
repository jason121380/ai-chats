import type { CouncilRole } from "@prisma/client"

import type { LabeledResponse } from "./types"

export const ROLE_DESCRIPTIONS: Record<CouncilRole, string> = {
  STRATEGIST:
    "You are the council's Strategist. Focus on long-term positioning, competitive dynamics, market timing, and strategic trade-offs.",
  RISK_ANALYST:
    "You are the council's Risk Analyst. Focus on downside scenarios, hidden assumptions, regulatory/financial/operational risks, and what could go wrong.",
  RESEARCHER:
    "You are the council's Researcher. Focus on facts, data, precedents, comparable cases, and what evidence supports or contradicts each option.",
  DEVILS_ADVOCATE:
    "You are the council's Devil's Advocate. Deliberately challenge the obvious answer. Argue the strongest opposing case and stress-test popular assumptions.",
  CREATIVE:
    "You are the council's Creative thinker. Propose unconventional options, reframings, and lateral solutions others would miss.",
  EXECUTION:
    "You are the council's Execution expert. Focus on feasibility, resources, sequencing, operational detail, and what it takes to actually deliver.",
  CHAIRMAN:
    "You are the council's Chairman. Integrate all perspectives and make the final decision.",
  GENERAL:
    "You are a member of an advisory council. Provide your best independent analysis.",
}

export function buildRoundOneSystemPrompt(role: CouncilRole): string {
  return [
    ROLE_DESCRIPTIONS[role],
    "",
    "You are one member of an AI advisory council. Several advisors are analyzing the same question independently and in parallel. You cannot see the other advisors' answers, and they cannot see yours.",
    "Give your own complete, self-contained analysis: key considerations, your recommendation, and the reasoning behind it. Be concrete and decision-oriented.",
  ].join("\n")
}

export function buildRoundOneUserPrompt(question: string): string {
  return question
}

export function buildCritiqueSystemPrompt(): string {
  return [
    "You are a member of an AI advisory council in the critique round.",
    "You will receive the original question and several anonymous responses (labeled Response A, Response B, ...). One of them may be your own — you do not know which. Judge purely on merit.",
  ].join("\n")
}

export function buildCritiqueUserPrompt(
  question: string,
  responses: LabeledResponse[]
): string {
  const parts: string[] = [
    `Original question:\n${question}`,
    "",
    "Anonymous council responses:",
  ]
  for (const r of responses) {
    parts.push("", `--- Response ${r.label} ---`, r.content)
  }
  parts.push(
    "",
    "Critique the responses above. Answer explicitly, referring to responses only by their labels:",
    "1. Which response do you agree with most, and why?",
    "2. Which response do you disagree with most, and why?",
    "3. What are the main flaws or blind spots of each response?",
    "4. Which claims or assumptions lack supporting evidence?",
    "5. Has anything here changed your own original judgment? How?",
    "6. State your best revised recommendation after considering all responses."
  )
  return parts.join("\n")
}

export function buildChairmanSystemPrompt(): string {
  return [
    "You are the Chairman of an AI advisory council.",
    "Several advisors answered the question independently, then critiqued each other's answers anonymously. You have all of that material.",
    "Your job is to make the best possible decision for the decision-maker. The goal is to make the best decision, not to average all answers. Take sides where the evidence warrants it, and say clearly what should be done.",
    "",
    "Structure your answer with exactly these sections:",
    "## Executive Summary",
    "## Consensus",
    "## Key Disagreements",
    "## Key Risks",
    "## Recommended Decision",
    "## Action Plan",
    "## Confidence",
    "",
    "In Confidence, give a level (High / Medium / Low) and what would change your mind.",
  ].join("\n")
}

export function buildChairmanUserPrompt(
  question: string,
  roundOne: LabeledResponse[],
  critiques: LabeledResponse[]
): string {
  const parts: string[] = [`Original question:\n${question}`]

  parts.push("", "=== Round 1 — independent anonymous responses ===")
  for (const r of roundOne) {
    parts.push("", `--- Response ${r.label} ---`, r.content)
  }

  if (critiques.length > 0) {
    parts.push("", "=== Round 2 — anonymous cross-critiques ===")
    for (const c of critiques) {
      parts.push("", `--- Critique by council member ${c.label} ---`, c.content)
    }
  } else {
    parts.push(
      "",
      "(The critique round was skipped because too few responses were available.)"
    )
  }

  parts.push(
    "",
    "Now integrate everything and deliver your Chairman decision in the required structure."
  )
  return parts.join("\n")
}
