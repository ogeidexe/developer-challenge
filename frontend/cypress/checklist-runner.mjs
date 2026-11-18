// Checklist import report: turns Cypress results into a session file for the manual test checklist
// (driven-tests/index.html → "Importar sessão", format dt-pleno-v1) plus a Markdown report to review first.
//
// Every Cypress test whose title carries a catalog id ("[REQ-01] …", several allowed) counts for that item:
//   all runs passed → good · some failed → work · all failed → missing · not run → left as in the base session.
//
// Usage (from frontend/):
//   node cypress/checklist-runner.mjs --run mock                 run the fake-backend suite, then report
//   node cypress/checklist-runner.mjs --run api                  run the real-API suite (stack must be up), then report
//   node cypress/checklist-runner.mjs --from cypress/reports/results-mock.json [--from …results-api.json]
//   … --base <session.json>   merge into a manual session exported by the checklist page (keeps manual results)
//   … --out <dir>             output folder (default cypress/reports)
//   … --spec <glob>           only these specs (e.g. cypress/e2e-api/04-checklist.cy.ts); CYPRESS_BASE_URL picks the stack
// Exit code 1 when a tagged test failed or no test ran — the files are written anyway.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { REPORTS_DIR, saveResults } from './results.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')
const repoDir = resolve(frontendDir, '..')
const catalogDir = join(repoDir, 'driven-tests', 'assets')
const FORMAT = 'dt-pleno-v1'
const TAG = /\[([A-Z]+-\d+)\]/g

// ---------- arguments ----------

const args = process.argv.slice(2)
const values = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []))
const runSuites = values('--run')
const fromFiles = values('--from').map((f) => resolve(f))
const baseFile = values('--base')[0] ? resolve(values('--base')[0]) : null
const outDir = values('--out')[0] ? resolve(values('--out')[0]) : REPORTS_DIR
const spec = values('--spec')[0]
const unknownSuite = runSuites.find((s) => !['mock', 'api'].includes(s))
if (unknownSuite || (runSuites.length === 0 && fromFiles.length === 0)) {
  console.error(
    'usage: node cypress/checklist-runner.mjs (--run mock|api)… (--from results.json)… [--base session.json] [--out dir]',
  )
  process.exit(2)
}

// ---------- run the suites ----------

delete process.env.ELECTRON_RUN_AS_NODE // VS Code terminals: the Cypress (Electron) binary will not start with it

for (const suite of runSuites) {
  if (suite === 'mock') {
    // the existing one-command runner: starts Vite, runs every fake-backend spec, saves results-mock.json
    const file = join(REPORTS_DIR, 'results-mock.json')
    rmSync(file, { force: true }) // never report an older run if this one cannot start (e.g. port in use)
    spawnSync(process.execPath, [join(here, 'e2e-runner.mjs'), ...(spec ? [spec] : [])], {
      cwd: frontendDir,
      stdio: 'inherit',
    })
    if (!existsSync(file)) {
      console.error('The fake-backend suite did not run (see the output above); no report written.')
      process.exit(1)
    }
    fromFiles.push(file)
  } else {
    const baseUrl = process.env.CYPRESS_BASE_URL || 'http://localhost:8080'
    const up = await fetch(`${baseUrl}/api/health`)
      .then((r) => r.ok)
      .catch(() => false)
    if (!up) {
      console.error(
        `Real stack not reachable at ${baseUrl}/api/health — run "docker compose up --build" at the repo root.`,
      )
      process.exit(1)
    }
    const { default: cypress } = await import('cypress')
    const result = await cypress.run({
      testingType: 'e2e',
      configFile: 'cypress.api.config.ts',
      project: frontendDir,
      ...(spec ? { spec } : {}),
    })
    fromFiles.push(saveResults('api', result, `API real em ${baseUrl}`))
  }
}

// ---------- inputs ----------

const readJson = (file, what) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`Cannot read ${what} ${file}: ${e.message}`)
    process.exit(1)
  }
}
const sources = [...new Set(fromFiles)].map((f) => ({ file: f, ...readJson(f, 'results') }))

/** The catalog of driven-tests/ (window.TEST_PLAN), to validate ids and show titles. */
function loadCatalog() {
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  for (const name of ['plan-functional.js', 'plan-delivery.js']) {
    const file = join(catalogDir, name)
    if (!existsSync(file)) return null
    vm.runInContext(readFileSync(file, 'utf8'), sandbox, { filename: name })
  }
  const tests = (sandbox.window.TEST_PLAN?.areas ?? []).flatMap((a) => a.tests.map((t) => ({ ...t, area: a.title })))
  return new Map(tests.map((t) => [t.id, t]))
}
const catalog = loadCatalog()
if (!catalog) console.warn(`Catalog not found in ${catalogDir}: ids are not validated.`)

let base = null
if (baseFile) {
  base = readJson(baseFile, 'base session')
  if (base.format !== FORMAT || typeof base.results !== 'object') {
    console.error(`${baseFile} is not a checklist session (format ${FORMAT}).`)
    process.exit(1)
  }
}

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: repoDir, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}
const commit = git('rev-parse', '--short', 'HEAD')
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const dirty = git('status', '--porcelain') !== ''
const target = commit ? `${branch}@${commit}${dirty ? ' + alterações locais' : ''}` : ''
const now = new Date()
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)

// ---------- aggregate by catalog id ----------

const byId = new Map() // id → { suites: { mock: {passed, failed}, … }, tests: [...] }
const unknownTags = new Set()
for (const src of sources) {
  for (const t of src.tests ?? []) {
    const full = t.title.join(' › ')
    for (const [, id] of full.matchAll(TAG)) {
      if (catalog && !catalog.has(id)) {
        unknownTags.add(id)
        continue
      }
      if (t.state !== 'passed' && t.state !== 'failed') continue // pending / skipped do not count
      const entry = byId.get(id) ?? { suites: {}, tests: [] }
      const s = (entry.suites[src.suite] ??= { passed: 0, failed: 0 })
      s[t.state]++
      entry.tests.push({ suite: src.suite, spec: t.spec, title: full, state: t.state, error: t.error })
      byId.set(id, entry)
    }
  }
}

const AUTO_PREFIX = 'Cypress automático'
const MANUAL_SEP = ' | nota manual: '
/** The tester's own note, without a previous automatic note (re-runs must not stack notes). */
const manualNote = (note) => {
  if (!note) return ''
  if (!note.startsWith(AUTO_PREFIX)) return note
  const i = note.indexOf(MANUAL_SEP)
  return i === -1 ? '' : note.slice(i + MANUAL_SEP.length)
}
const STATE_LABEL = { good: 'Good', work: 'Need Work', missing: 'Missing' }
const STATE_ICON = { good: '✅', work: '⚠️', missing: '❌' }

/**
 * Items the fake backend cannot prove: it sends no HTTP headers (Content-Type of the errors) and handles "parallel"
 * calls one after the other (no real race on the database). Passing only there is not enough for Good.
 */
const NEEDS_REAL_API = {
  'API-02': 'o backend simulado não envia o Content-Type application/problem+json',
  'NFR-01': 'o backend simulado processa as chamadas em sequência, sem corrida real no banco',
  'NFR-02': 'o backend simulado processa as chamadas em sequência, sem corrida real no banco',
}
const hasApiRun = sources.some((s) => s.suite === 'api')

const automated = new Map()
for (const [id, entry] of byId) {
  const passed = entry.tests.filter((t) => t.state === 'passed').length
  const failed = entry.tests.length - passed
  const realPassed = entry.suites.api ? entry.suites.api.passed > 0 && entry.suites.api.failed === 0 : false
  let state = failed === 0 ? 'good' : passed === 0 ? 'missing' : 'work'
  const mockOnlyCaveat = state === 'good' && NEEDS_REAL_API[id] && !realPassed ? NEEDS_REAL_API[id] : null
  if (mockOnlyCaveat) state = 'work'
  const perSuite = Object.entries(entry.suites)
    .map(([suite, s]) => `${suite} ${s.passed}/${s.passed + s.failed} ${s.failed ? '✖' : '✔'}`)
    .join(', ')
  const failures = entry.tests
    .filter((t) => t.state === 'failed')
    .map((t) => `[${t.suite}] "${t.title}"${t.error ? ` — ${t.error}` : ''}`)
  let note = `${AUTO_PREFIX} (${today}${commit ? `, ${commit}` : ''}): ${perSuite}`
  if (failures.length) note += ` — falhou: ${failures.join('; ')}`
  if (mockOnlyCaveat) note += ` — falta a API real: ${mockOnlyCaveat}; rode npm run checklist:api`
  else if (!entry.suites.api) note += ' — evidência só do backend simulado'
  automated.set(id, { state, note, entry })
}

// ---------- session file (import) ----------

const results = {}
for (const [id, r] of Object.entries(base?.results ?? {})) {
  if (!catalog || catalog.has(id)) results[id] = r
}
const changes = []
for (const [id, auto] of automated) {
  const previous = results[id]
  const manual = manualNote(previous?.note)
  results[id] = {
    state: auto.state,
    note: manual ? `${auto.note}${MANUAL_SEP}${manual}` : auto.note,
    updatedAt: now.toISOString(),
  }
  if (base && previous?.state !== auto.state) changes.push({ id, from: previous?.state ?? null, to: auto.state })
}
const session = {
  format: FORMAT,
  exportedAt: now.toISOString(),
  meta: {
    ...(base?.meta ?? {}),
    tester: base?.meta?.tester || 'Cypress (automático)',
    target: [target && `código ${target}`, ...sources.filter((s) => s.target).map((s) => `${s.suite}: ${s.target}`)]
      .filter(Boolean)
      .join(' · '),
    date: today,
  },
  results,
}

// ---------- Markdown report ----------

const md = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
const catalogTitle = (id) => md(catalog?.get(id)?.title ?? '')
const order = (a, b) => {
  const ids = catalog ? [...catalog.keys()] : []
  return ids.indexOf(a) - ids.indexOf(b) || a.localeCompare(b)
}
const count = (state) => [...automated.values()].filter((a) => a.state === state).length
const totalTests = sources.reduce((n, s) => n + (s.stats?.tests ?? 0), 0)
const failedTests = sources.reduce((n, s) => n + (s.stats?.failed ?? 0), 0)

const lines = [
  '# Relatório de importação do checklist (Cypress)',
  '',
  `- **Gerado em:** ${now.toISOString()}`,
  `- **Código local:** ${md(target) || '—'} (a suíte da API real testa o que está implantado na URL abaixo, que pode ser outra versão)`,
  `- **Sessão base (manual):** ${baseFile ? md(relative(repoDir, baseFile)) : '— (sem base: só os itens automatizados)'}`,
  `- **Arquivo para importar:** \`checklist-import.json\` (formato \`${FORMAT}\`)`,
  '',
  '## Execuções',
  '',
  '| Suíte | Alvo | Arquivo | Testes | Passaram | Falharam | Pendentes/pulados |',
  '|---|---|---|---|---|---|---|',
  ...sources.map(
    (s) =>
      `| ${s.suite} | ${md(s.target) || '—'} | \`${md(relative(repoDir, s.file))}\` | ${s.stats?.tests ?? 0} | ${s.stats?.passed ?? 0} | ${s.stats?.failed ?? 0} | ${(s.stats?.pending ?? 0) + (s.stats?.skipped ?? 0)} |`,
  ),
  ...sources.filter((s) => s.ranOk === false).map((s) => `\n> ⚠️ A suíte ${s.suite} não executou: ${md(s.message)}`),
  '',
  `## Itens do catálogo cobertos pelo Cypress: ${automated.size}`,
  '',
  ...(hasApiRun
    ? []
    : [
        '> ⚠️ **Só o backend simulado foi executado.** Os resultados valem para as regras de negócio e a interface, que',
        '> o simulado reproduz; o contrato HTTP real (Spring, PostgreSQL, Redis, Nginx) só fica provado com',
        `> \`npm run checklist:api\` contra o \`docker compose\`. Itens que o simulado não consegue provar (${Object.keys(NEEDS_REAL_API).join(', ')})`,
        '> ficam como **Need Work** até lá.',
        '',
      ]),
  `${STATE_ICON.good} Good ${count('good')} · ${STATE_ICON.work} Need Work ${count('work')} · ${STATE_ICON.missing} Missing ${count('missing')}`,
  '',
  '| ID | Teste do catálogo | Resultado | Evidência |',
  '|---|---|---|---|',
  ...[...automated.keys()].sort(order).map((id) => {
    const a = automated.get(id)
    const perSuite = Object.entries(a.entry.suites)
      .map(([suite, s]) => `${suite} ${s.passed}/${s.passed + s.failed}`)
      .join(' · ')
    return `| ${id} | ${catalogTitle(id)} | ${STATE_ICON[a.state]} ${STATE_LABEL[a.state]} | ${perSuite} (${a.entry.tests.length} teste${a.entry.tests.length > 1 ? 's' : ''}) |`
  }),
  '',
]

const failedEntries = [...automated.entries()].filter(([, a]) => a.state !== 'good').sort(([x], [y]) => order(x, y))
if (failedEntries.length) {
  lines.push('## Falhas', '')
  for (const [id, a] of failedEntries) {
    lines.push(`### ${id} — ${catalogTitle(id)}`, '')
    for (const t of a.entry.tests.filter((x) => x.state === 'failed')) {
      lines.push(`- **[${t.suite}]** \`${md(t.spec)}\` › ${md(t.title)}`, `  - ${md(t.error) || 'sem mensagem'}`)
    }
    lines.push('')
  }
}

if (changes.length) {
  lines.push(
    '## Mudanças em relação à sessão manual',
    '',
    '| ID | Teste do catálogo | Manual | Cypress |',
    '|---|---|---|---|',
  )
  for (const c of changes.sort((x, y) => order(x.id, y.id))) {
    lines.push(`| ${c.id} | ${catalogTitle(c.id)} | ${c.from ? STATE_LABEL[c.from] : '—'} | ${STATE_LABEL[c.to]} |`)
  }
  lines.push('')
}

if (catalog) {
  const manualOnly = [...catalog.keys()].filter((id) => !automated.has(id))
  lines.push(
    `## Itens não automatizados: ${manualOnly.length} (conferência manual)`,
    '',
    'Ficam como estavam na sessão base. Inspeção de código, logs do Docker, documentação, vídeo e regras do repositório não',
    'se verificam pelo navegador.',
    '',
    '| ID | Teste do catálogo | Resultado na sessão base |',
    '|---|---|---|',
    ...manualOnly.map((id) => {
      const r = results[id]
      return `| ${id} | ${catalogTitle(id)} | ${r?.state ? `${STATE_LABEL[r.state]}${r.note ? ` — ${md(r.note)}` : ''}` : 'pendente'} |`
    }),
    '',
  )
}

if (unknownTags.size) {
  lines.push(
    `> ⚠️ Ids nos títulos dos testes que não existem no catálogo (ignorados): ${[...unknownTags].sort().join(', ')}`,
    '',
  )
}

lines.push(
  '## Como conferir e carregar',
  '',
  '1. Revise este relatório (falhas e mudanças em relação à sessão manual).',
  '2. Abra `driven-tests/index.html` no navegador.',
  '3. Clique em **Importar sessão** e escolha `checklist-import.json`. A importação substitui a sessão do navegador.',
  '   Para não perder resultados manuais, gere o relatório com `--base <sessão exportada>`.',
  '4. Cada item automatizado traz na nota a suíte, a contagem e, se falhou, o teste e o erro.',
  '',
)

mkdirSync(outDir, { recursive: true })
const importFile = join(outDir, 'checklist-import.json')
const reportFile = join(outDir, 'checklist-report.md')
writeFileSync(importFile, `${JSON.stringify(session, null, 2)}\n`)
writeFileSync(reportFile, `${lines.join('\n')}\n`)

console.log(
  `\nChecklist: ${automated.size} catalog items from ${totalTests} tests — good ${count('good')}, need work ${count('work')}, missing ${count('missing')}`,
)
if (unknownTags.size) console.log(`  unknown ids ignored: ${[...unknownTags].join(', ')}`)
console.log(`  import file: ${relative(process.cwd(), importFile)}`)
console.log(`  report:      ${relative(process.cwd(), reportFile)}`)

const badRun = sources.some((s) => s.ranOk === false) || totalTests === 0
process.exit(failedTests > 0 || badRun ? 1 : 0)
