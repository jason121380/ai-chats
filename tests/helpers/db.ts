import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

let client: PrismaClient | null = null

export function getTestDb(): PrismaClient {
  if (client) return client
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://council:council@localhost:5432/ai_council",
  })
  client = new PrismaClient({ adapter })
  return client
}
