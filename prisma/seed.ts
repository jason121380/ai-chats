/**
 * Seed initial ModelConfig rows and (optionally) ModelPricing.
 *
 * Model IDs below are real, publicly documented IDs at the time of writing —
 * verify them against each provider's docs and your account access before
 * relying on them. Change or add rows freely; the seed is idempotent.
 *
 * Pricing is intentionally NOT hardcoded here. To seed pricing, copy
 * prisma/pricing.example.json to prisma/pricing.json, fill in the prices
 * from the providers' official pricing pages, and re-run the seed.
 * Until then the UI shows "Pricing not configured" and runs record
 * pricingStatus = MISSING (requests still succeed).
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import { PrismaClient, type ProviderName, type CouncilRole } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

interface SeedModel {
  provider: ProviderName
  modelId: string
  displayName: string
  defaultRole: CouncilRole
  sortOrder: number
  supportsReasoning?: boolean
}

const MODELS: SeedModel[] = [
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    defaultRole: "STRATEGIST",
    sortOrder: 1,
    supportsReasoning: true,
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    defaultRole: "RISK_ANALYST",
    sortOrder: 2,
  },
  {
    provider: "GOOGLE",
    modelId: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    defaultRole: "RESEARCHER",
    sortOrder: 3,
    supportsReasoning: true,
  },
  {
    provider: "XAI",
    modelId: "grok-4",
    displayName: "Grok 4",
    defaultRole: "DEVILS_ADVOCATE",
    sortOrder: 4,
    supportsReasoning: true,
  },
]

/**
 * Model IDs this project has moved off. Changing `modelId` above creates a
 * NEW row — the old one stays in the database, stays enabled, and keeps
 * offering a model the provider now 404s on. Listing it here disables it on
 * the next boot.
 *
 * Deleted, not just disabled. ModelRun records `provider` / `modelId` as
 * plain columns with no foreign key to ModelConfig, so removing the row
 * costs the ledger nothing — past calls keep their tokens, price snapshot
 * and cost. Leaving a disabled row behind only kept a dead model in front
 * of the operator in 設定 forever.
 *
 * Only IDs named here are touched. A row someone inserted by hand is left
 * alone — a seed that deleted everything it did not recognise would undo
 * that choice on every redeploy, silently.
 */
const RETIRED: { provider: ProviderName; modelId: string }[] = [
  // Returns an empty completion rather than an error (observed 2026-09-15).
  { provider: "OPENAI", modelId: "gpt-5.1" },
  // 404: "no longer available to new users" (observed 2026-09-15).
  { provider: "GOOGLE", modelId: "gemini-2.5-pro" },
]

interface PricingSeedRow {
  provider: ProviderName
  modelId: string
  inputPerMillion: string
  outputPerMillion: string
  cachedInputPerMillion?: string | null
  reasoningPerMillion?: string | null
  effectiveFrom?: string
  source?: string
}

async function main() {
  /**
   * The defaults are for a database that has never had a model in it.
   *
   * They used to be upserted on every boot, which meant deleting one in 設定
   * undid itself on the next deploy: the row came back, enabled, and the
   * operator had to delete it again after every push. That was the seed
   * treating this file as the authority on which models exist, when the
   * authority is whoever is running the thing — they can now add any model
   * OpenRouter carries without touching the repository at all.
   *
   * So: provision a first boot, where a blank 設定 reads as a broken deploy,
   * and after that leave the list alone. An empty table is the one case this
   * cannot tell apart from a fresh install, so deleting every model and
   * redeploying does bring the defaults back — which beats an app with
   * nothing to call.
   */
  const configured = await prisma.modelConfig.count()
  if (configured === 0) {
    for (const model of MODELS) {
      await prisma.modelConfig.upsert({
        where: {
          provider_modelId: { provider: model.provider, modelId: model.modelId },
        },
        create: {
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          defaultRole: model.defaultRole,
          sortOrder: model.sortOrder,
          supportsReasoning: model.supportsReasoning ?? false,
          enabled: true,
        },
        update: {
          displayName: model.displayName,
          sortOrder: model.sortOrder,
        },
      })
      console.log(`ModelConfig seeded: ${model.provider}/${model.modelId}`)
    }
  } else {
    console.log(
      `ModelConfig: ${configured} already configured — leaving the list as the operator left it`
    )
  }

  for (const retired of RETIRED) {
    const { count } = await prisma.modelConfig.deleteMany({
      where: { provider: retired.provider, modelId: retired.modelId },
    })
    if (count > 0) {
      console.log(
        `ModelConfig removed (retired): ${retired.provider}/${retired.modelId}`
      )
    }
  }

  const pricingPath = join(__dirname, "pricing.json")
  if (existsSync(pricingPath)) {
    const rows = JSON.parse(
      readFileSync(pricingPath, "utf8")
    ) as PricingSeedRow[]
    for (const row of rows) {
      const effectiveFrom = row.effectiveFrom
        ? new Date(row.effectiveFrom)
        : new Date()
      const existing = await prisma.modelPricing.findFirst({
        where: {
          provider: row.provider,
          modelId: row.modelId,
          effectiveTo: null,
        },
      })
      if (
        existing &&
        existing.inputPerMillion.toString() === row.inputPerMillion &&
        existing.outputPerMillion.toString() === row.outputPerMillion
      ) {
        console.log(`Pricing unchanged: ${row.provider}/${row.modelId}`)
        continue
      }
      await prisma.$transaction(async (tx) => {
        await tx.modelPricing.updateMany({
          where: {
            provider: row.provider,
            modelId: row.modelId,
            effectiveTo: null,
          },
          data: { effectiveTo: effectiveFrom },
        })
        await tx.modelPricing.create({
          data: {
            provider: row.provider,
            modelId: row.modelId,
            inputPerMillion: row.inputPerMillion,
            outputPerMillion: row.outputPerMillion,
            cachedInputPerMillion: row.cachedInputPerMillion ?? null,
            reasoningPerMillion: row.reasoningPerMillion ?? null,
            effectiveFrom,
            source: row.source ?? "seed",
          },
        })
      })
      console.log(`Pricing seeded: ${row.provider}/${row.modelId}`)
    }
  } else {
    console.log(
      "No prisma/pricing.json found — skipping pricing seed. " +
        "UI will show 'Pricing not configured' until prices are added."
    )
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
