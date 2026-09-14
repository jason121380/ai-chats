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
    modelId: "gpt-5.1",
    displayName: "GPT-5.1",
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
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
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
    console.log(`ModelConfig ready: ${model.provider}/${model.modelId}`)
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
