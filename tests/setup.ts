import "@testing-library/jest-dom/vitest"

// Test-time environment defaults. Automated tests never call real paid AI APIs;
// providers are always mocked, so these keys are placeholders only.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://council:council@localhost:5432/ai_council"
process.env.APP_SECRET = process.env.APP_SECRET ?? "test-secret"
