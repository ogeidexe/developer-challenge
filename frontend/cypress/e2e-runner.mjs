// One-command E2E run: starts Vite in-process, runs Cypress headless, stops Vite, exits with the result.
// Uses the Vite and Cypress JS APIs instead of spawning/killing processes — tools that kill process trees
// on Windows (e.g. start-server-and-test → wmic.exe) break on recent Windows 11 builds where wmic is gone.
import { createServer } from 'vite'
import cypress from 'cypress'

// VS Code terminals export ELECTRON_RUN_AS_NODE=1, which stops the Cypress (Electron) binary from starting.
delete process.env.ELECTRON_RUN_AS_NODE

const HOST = '127.0.0.1' // not "localhost": it may resolve to ::1 while Cypress uses IPv4
const PORT = 5174 // must match baseUrl in cypress.config.ts

// Vite 5 calls process.exit() when stdin ends unless CI=true. With a non-TTY stdin (CI, IDEs, piped
// shells) that kills this runner with exit code 0 before Cypress even starts — a silent false pass.
// The check happens when the server is created, so set CI only around createServer.
const previousCI = process.env.CI
process.env.CI = 'true'
const server = await createServer({ server: { host: HOST, port: PORT, strictPort: true } })
if (previousCI === undefined) delete process.env.CI
else process.env.CI = previousCI
await server.listen()
console.log(`Vite ready on http://${HOST}:${PORT}`)

let exitCode = 1
try {
  const result = await cypress.run({ testingType: 'e2e', ...(process.argv[2] ? { spec: process.argv[2] } : {}) })
  if (result.status === 'failed') {
    console.error(result.message)
  } else {
    const { totalTests, totalPassed, totalFailed, totalPending, totalSkipped } = result
    console.log(`\nE2E: ${totalTests} tests · ${totalPassed} passed · ${totalFailed} failed · ${totalPending} pending · ${totalSkipped} skipped`)
    for (const run of result.runs) {
      for (const t of run.tests.filter((x) => x.state === 'failed')) console.log(`  ✖ ${run.spec.relative} › ${t.title.join(' › ')}`)
    }
    exitCode = totalFailed === 0 && totalTests > 0 ? 0 : 1 // zero tests found is a failure, not a pass
  }
} finally {
  await server.close()
}
process.exit(exitCode)
