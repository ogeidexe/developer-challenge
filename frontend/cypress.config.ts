import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    // Dedicated port (npm run dev:e2e) so the suite never collides with a normal `npm run dev` on 5173.
    // 127.0.0.1, not "localhost": Node may resolve localhost to ::1 while the readiness check uses IPv4.
    baseUrl: 'http://127.0.0.1:5174',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1440,
    viewportHeight: 900,
    // the fake backend answers in 80–220 ms; antd animations add a little more
    defaultCommandTimeout: 8000,
    video: false,
    screenshotOnRunFailure: true,
    retries: { runMode: 1, openMode: 0 },
  },
})
