-- OpenRouter: one key that routes to every vendor it carries. Its own enum
-- value because its prices and token counts are its own, not the upstream
-- vendor's, and the ledger keys price snapshots by provider + modelId.
ALTER TYPE "ProviderName" ADD VALUE 'OPENROUTER';
