/** Visual identity for each participant in the chat transcript. */

export interface SpeakerStyle {
  /** Avatar background + text */
  avatar: string
  /** Left accent bar on the message bubble */
  accent: string
  /** Name color */
  name: string
}

const PROVIDER_STYLES: Record<string, SpeakerStyle> = {
  OPENAI: {
    avatar: "bg-emerald-600 text-white",
    accent: "bg-emerald-500",
    name: "text-emerald-700 dark:text-emerald-400",
  },
  ANTHROPIC: {
    avatar: "bg-orange-600 text-white",
    accent: "bg-orange-500",
    name: "text-orange-700 dark:text-orange-400",
  },
  GOOGLE: {
    avatar: "bg-blue-600 text-white",
    accent: "bg-blue-500",
    name: "text-blue-700 dark:text-blue-400",
  },
  XAI: {
    avatar: "bg-violet-600 text-white",
    accent: "bg-violet-500",
    name: "text-violet-700 dark:text-violet-400",
  },
  MUSE: {
    avatar: "bg-pink-600 text-white",
    accent: "bg-pink-500",
    name: "text-pink-700 dark:text-pink-400",
  },
  SPARK: {
    avatar: "bg-amber-600 text-white",
    accent: "bg-amber-500",
    name: "text-amber-700 dark:text-amber-400",
  },
}

const FALLBACK: SpeakerStyle = {
  avatar: "bg-zinc-600 text-white",
  accent: "bg-zinc-500",
  name: "text-zinc-700 dark:text-zinc-300",
}

export function speakerStyle(provider: string): SpeakerStyle {
  return PROVIDER_STYLES[provider] ?? FALLBACK
}

/**
 * Two-character avatar initials from a display name.
 * "Claude Sonnet 4.5" → "CS"; "gpt-5.1" → "GP".
 */
export function speakerInitials(name: string): string {
  const words = name
    .split(/[\s\-_.]+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return (words[0] ?? name).slice(0, 2).toUpperCase()
}
