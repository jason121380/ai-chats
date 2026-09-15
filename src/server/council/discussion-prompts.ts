import type { CouncilRole } from "@prisma/client"

import { ROLE_DESCRIPTIONS } from "./prompts"
import { HUMAN_SPEAKER_NAME } from "./types"
import type { DiscussionEntry } from "./types"

/**
 * Discussion prompts are deliberately the OPPOSITE of the Council's critique
 * prompts: speakers are named, not anonymized, and every speaker sees the
 * whole transcript. Council avoids anchoring; Discussion wants the models to
 * actually react to each other, like people in a meeting.
 */

const REPLY_LANGUAGE =
  "Speak in Traditional Chinese (繁體中文, Taiwan usage), regardless of the language these instructions are written in."

export function buildDiscussionSystemPrompt(
  speakerName: string,
  role: CouncilRole,
  participants: string[],
  roundNumber: number,
  totalRounds: number,
  transcript: DiscussionEntry[]
): string {
  const others = participants.filter((p) => p !== speakerName)

  // Who has actually spoken, derived from the transcript rather than from the
  // speaker list: a participant whose turn failed is not in the transcript,
  // and addressing them would be as wrong as addressing someone whose turn has
  // not come up yet.
  const spoken = transcript
    .map((turn) => turn.speakerName)
    .filter((name, i, all) => all.indexOf(name) === i)
  const previousSpeaker = transcript[transcript.length - 1]?.speakerName ?? null
  const notYetSpoken = others.filter((name) => !spoken.includes(name))

  const lines = [
    `You are "${speakerName}", one participant in a live group discussion.`,
    "",
    ROLE_DESCRIPTIONS[role],
    "",
    others.length > 0
      ? `The other participants are: ${others.join(", ")}. You can see everything they have said, and they will see what you say.`
      : "You are currently the only participant speaking.",
    "",
    `This is speaking round ${roundNumber} of ${totalRounds}.`,
    "",
    // Floor discipline. Without this the opener addresses participants who
    // have not spoken yet — it knows their names from the roster above, and a
    // blanket "name who you are pushing back on" rule invites it to invent a
    // position for them. Everything below is the turn-taking contract.
    "Taking the floor:",
    "- People speak one at a time and you have the floor right now. Say your piece and stop; do not continue past your own turn.",
    "- Never speak for another participant, quote words they have not said, or predict what they are about to say. If you want their view, the discussion will get there on their turn.",
    // The human is not in `participants`: they asked the question, so the
    // "has not spoken yet, do not address them" rule must never apply to them.
    `- The person who asked the question is in the room as "${HUMAN_SPEAKER_NAME}" and may cut in at any time. If they have just spoken, answer them directly before anything else.`,
  ]

  if (previousSpeaker === null) {
    lines.push(
      "- Nobody has spoken yet. There is nothing to react to and nobody to address: do not name, greet, question or argue with any other participant in this turn. State your own position and stop."
    )
  } else {
    lines.push(
      `- You are speaking immediately after ${previousSpeaker}. Open by responding to what ${previousSpeaker} just said — agree with it, push back on it, or build on it — before you add anything of your own.`,
      `- You may also refer to anyone else who has already spoken: ${spoken.join(", ")}.`
    )
    if (notYetSpoken.length > 0) {
      const verb = notYetSpoken.length === 1 ? "has" : "have"
      lines.push(
        `- ${notYetSpoken.join(", ")} ${verb} not spoken yet. Do not address them and do not attribute any view to them; wait for their turn.`
      )
    }
  }

  lines.push(
    "",
    "How to speak in this meeting:",
    "- Talk like a person in a meeting, not like a report. No headings, no numbered outlines.",
    "- Keep it short: two to four short paragraphs at most. Others still need to speak.",
    "- Add something new. If you only agree, say so in one line and then add the point nobody has made yet.",
    "- Disagree openly when you disagree. A meeting where everyone agrees is a waste of everyone's time.",
    "- Do not summarize the discussion so far — everyone was there.",
    "- Do not write your own name as a prefix; the interface already shows who is speaking.",
    "",
    REPLY_LANGUAGE,
    "Refer to the other participants by the names given above, exactly as written."
  )

  if (roundNumber === 1) {
    lines.push(
      "",
      "This is the opening round. Give your initial position on the question clearly enough that others have something to react to."
    )
  } else if (roundNumber === totalRounds) {
    lines.push(
      "",
      "This is the final round. Say where you now stand after hearing the others, including anything that changed your mind, and what you would actually do."
    )
  }

  return lines.join("\n")
}

export function buildDiscussionUserPrompt(
  question: string,
  transcript: DiscussionEntry[]
): string {
  const parts: string[] = [`The question on the table:\n${question}`]

  if (transcript.length === 0) {
    parts.push(
      "",
      "Nobody has spoken yet. You are opening the discussion, so there is nothing to respond to and nobody to address."
    )
  } else {
    parts.push("", "The discussion so far:")
    transcript.forEach((turn, i) => {
      const isLast = i === transcript.length - 1
      parts.push(
        "",
        `${turn.speakerName}:${isLast ? " (spoke just now)" : ""}`,
        turn.content
      )
    })
    const previous = transcript[transcript.length - 1]!.speakerName
    parts.push(
      "",
      `It is your turn to speak, right after ${previous}. Respond to ${previous} first.`
    )
  }

  return parts.join("\n")
}

export function buildDiscussionSummarySystemPrompt(): string {
  return [
    "You chaired a group discussion between several AI participants and are now writing the closing summary for the decision-maker who asked the question.",
    "You have the full transcript, with every speaker named.",
    "",
    "Your job is to make the best decision, not to average what everyone said. Take a position where the discussion supports one.",
    "",
    "Structure your summary with exactly these section headings, written exactly as shown (they are already in Traditional Chinese):",
    "## 執行摘要",
    "## 共識之處",
    "## 分歧之處",
    "## 關鍵風險",
    "## 建議決策",
    "## 行動計畫",
    "## 信心水準",
    "",
    "Attribute specific arguments to the participant who made them — unlike the discussion itself, this summary is not anonymous.",
    "Under 信心水準, give a level (高 / 中 / 低) and what would change your mind.",
    "",
    REPLY_LANGUAGE,
  ].join("\n")
}

export function buildDiscussionSummaryUserPrompt(
  question: string,
  transcript: DiscussionEntry[]
): string {
  const parts: string[] = [
    `The question:\n${question}`,
    "",
    "=== Full discussion transcript ===",
  ]
  for (const turn of transcript) {
    parts.push(
      "",
      `[Round ${turn.roundNumber}] ${turn.speakerName}:`,
      turn.content
    )
  }
  parts.push("", "Now write your closing summary in the required structure.")
  return parts.join("\n")
}
