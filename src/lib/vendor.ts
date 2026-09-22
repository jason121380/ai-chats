/**
 * The vendor behind a configured model.
 *
 * For a direct provider it is the provider. For OpenRouter the provider is
 * the gateway and the vendor is the first segment of the model slug
 * (`anthropic/claude-sonnet-4.5` → ANTHROPIC), with the `~` of a
 * latest-alias (`~openai/gpt-sol-latest`) stripped first.
 *
 * Display only. The ledger, pricing and the registry key everything by the
 * configured provider; this exists so a transcript with four OpenRouter
 * models shows four recognisable speakers instead of four identical ones.
 */
const OPENROUTER_VENDORS: Record<string, string> = {
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  google: "GOOGLE",
  "x-ai": "XAI",
}

export function vendorOf(provider: string, modelId: string): string {
  if (provider !== "OPENROUTER") return provider
  const slug = modelId.startsWith("~") ? modelId.slice(1) : modelId
  const slash = slug.indexOf("/")
  if (slash === -1) return provider
  return OPENROUTER_VENDORS[slug.slice(0, slash)] ?? provider
}
