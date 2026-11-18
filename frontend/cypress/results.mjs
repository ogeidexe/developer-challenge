// Raw Cypress results saved by the runners (cypress/e2e-runner.mjs, cypress/checklist-runner.mjs) so the checklist
// report can be rebuilt later without running the suites again: cypress/reports/results-<suite>.json.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'reports')

// the ANSI color codes Cypress puts in error messages
// eslint-disable-next-line no-control-regex -- matching the ESC control character is the point
const ANSI_COLORS = /\u001b\[[0-9;]*m/g

/** First line of a Cypress error, without ANSI colors, at most `max` characters. */
export function shortError(text, max = 240) {
  if (!text) return null
  const line =
    String(text)
      .replace(ANSI_COLORS, '')
      .split('\n')
      .find((l) => l.trim()) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Saves the result of `cypress.run()` for `suite` ("mock" or "api") run against `target`; returns the file path. */
export function saveResults(suite, result, target = null) {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const file = join(REPORTS_DIR, `results-${suite}.json`)
  const tests = (result.runs ?? []).flatMap((run) =>
    run.tests.map((t) => ({
      spec: run.spec.relative.replace(/\\/g, '/'),
      title: t.title,
      state: t.state, // passed | failed | pending | skipped
      error: shortError(t.displayError),
    })),
  )
  const data = {
    suite,
    target, // what the suite ran against (URL of the stack, or the fake backend)
    generatedAt: new Date().toISOString(),
    ranOk: result.status !== 'failed', // "failed" = Cypress itself could not run
    message: result.status === 'failed' ? result.message : null,
    stats: {
      tests: result.totalTests ?? 0,
      passed: result.totalPassed ?? 0,
      failed: result.totalFailed ?? 0,
      pending: result.totalPending ?? 0,
      skipped: result.totalSkipped ?? 0,
    },
    tests,
  }
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return file
}
