import { defineConfig } from 'cypress'

// E2E against the REAL stack (docker compose: nginx frontend → Spring backend → PostgreSQL), not the fake
// backend. Start the stack first (`docker compose up --build` at the repo root), then `npm run test:e2e:api`.
// The database is NOT reset between tests: every test uses its own seed request or creates its own data.
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:8080',
    specPattern: 'cypress/e2e-api/**/*.cy.ts',
    supportFile: 'cypress/support/api.ts',
    env: { REAL_API: true }, // makes `apiAs` call the real API instead of the in-page fake backend
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
    // no retries: a retried test would act on data the first attempt already changed
    retries: { runMode: 0, openMode: 0 },
  },
})
