import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Removing a model from 設定 deletes its ModelConfig row. That is only safe
 * because the billing ledger does not depend on it: ModelRun carries
 * `provider` and `modelId` as its own scalar columns, and the usage and
 * history pages read those columns rather than joining ModelConfig.
 *
 * The danger is a later, entirely reasonable-looking change — adding a
 * relation from ModelRun to ModelConfig so the display name can be joined.
 * With `onDelete: Cascade` that turns "remove a model I no longer use" into
 * "erase its invoices"; with `Restrict` it turns the delete button into a
 * dead control. Either way nothing in the delete path would look wrong, so
 * the invariant is pinned here at the schema.
 */
const schema = readFileSync(
  join(__dirname, "..", "..", "prisma", "schema.prisma"),
  "utf8"
)

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`)
  expect(start, `model ${name} not found in schema.prisma`).toBeGreaterThan(-1)
  const end = schema.indexOf("\n}", start)
  return schema.slice(start, end)
}

describe("the billing ledger does not depend on ModelConfig", () => {
  it("ModelRun has no relation to ModelConfig", () => {
    expect(modelBlock("ModelRun")).not.toContain("ModelConfig")
  })

  it("ModelRun identifies its model by its own scalar columns", () => {
    const block = modelBlock("ModelRun")
    expect(block).toMatch(/^\s*provider\s+ProviderName\s*$/m)
    expect(block).toMatch(/^\s*modelId\s+String\s*$/m)
  })

  it("ModelConfig declares no back-relations that a delete would cascade", () => {
    const block = modelBlock("ModelConfig")
    expect(block).not.toContain("ModelRun")
    expect(block).not.toContain("@relation")
  })

  it("ModelPricing is keyed the same way, so a re-added model finds its prices", () => {
    const block = modelBlock("ModelPricing")
    expect(block).not.toContain("ModelConfig")
    expect(block).toMatch(/^\s*provider\s+ProviderName\s*$/m)
    expect(block).toMatch(/^\s*modelId\s+String\s*$/m)
  })
})
