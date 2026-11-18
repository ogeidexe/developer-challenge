// Integrity check of the manual test catalog (run in CI): every test has id, title, steps, expected result and
// reference; ids are unique and prefixed with their area id; every script of the page parses.
// Usage: node driven-tests/check-plan.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = ['plan-functional.js', 'plan-delivery.js', 'app.js', 'checklist.js', 'report.js']
const errors = []

for (const name of scripts) {
  try {
    new vm.Script(readFileSync(join(here, 'assets', name), 'utf8'), { filename: name })
  } catch (e) {
    errors.push(`${name}: does not parse (${e.message})`)
  }
}

const sandbox = { window: {} }
vm.createContext(sandbox)
for (const name of ['plan-functional.js', 'plan-delivery.js']) {
  vm.runInContext(readFileSync(join(here, 'assets', name), 'utf8'), sandbox, { filename: name })
}
const areas = sandbox.window.TEST_PLAN?.areas ?? []
if (areas.length === 0) errors.push('no areas found in window.TEST_PLAN')

const seen = new Set()
for (const area of areas) {
  for (const field of ['id', 'title', 'ref']) if (!area[field]) errors.push(`area ${area.id ?? '?'}: missing ${field}`)
  if (!Array.isArray(area.tests) || area.tests.length === 0) errors.push(`area ${area.id}: no tests`)
  if (area.intro !== undefined && (typeof area.intro !== 'string' || (area.intro.split('`').length - 1) % 2 !== 0)) {
    errors.push(`area ${area.id}: intro must be a string with balanced backticks`)
  }
  for (const test of area.tests ?? []) {
    const where = `${area.id}/${test.id ?? '?'}`
    for (const field of ['id', 'title', 'expected', 'ref']) {
      if (typeof test[field] !== 'string' || !test[field].trim()) errors.push(`${where}: missing ${field}`)
    }
    if (!Array.isArray(test.steps) || test.steps.length === 0 || test.steps.some((s) => !String(s).trim())) {
      errors.push(`${where}: steps must be a non-empty list`)
    }
    if (test.id && !test.id.startsWith(`${area.id}-`)) errors.push(`${where}: id must start with "${area.id}-"`)
    if (seen.has(test.id)) errors.push(`${where}: duplicate id`)
    seen.add(test.id)
    for (const field of ['screen', 'user']) {
      if (test[field] !== undefined && (typeof test[field] !== 'string' || !test[field].trim())) {
        errors.push(`${where}: ${field} must be a non-empty string when present`)
      }
    }
    const ticks = [test.title, test.expected, test.screen, test.user, ...(test.steps ?? [])].join('').split('`').length - 1
    if (ticks % 2 !== 0) errors.push(`${where}: unbalanced backticks`)
  }
}

if (errors.length) {
  console.error(`driven-tests: ${errors.length} problem(s)\n - ${errors.join('\n - ')}`)
  process.exit(1)
}
console.log(`driven-tests: ${areas.length} areas, ${seen.size} tests, all scripts parse`)
