/*
 * Roteiro de testes do desafio pleno — relatório final: resumo, tabela por área, itens Missing/Need Work com notas,
 * impressão (PDF), exportação em Markdown e JSON e importação de uma sessão salva.
 */
;(function () {
  'use strict'

  const { plan, allTests, rich, el, stateById, store, result, counts, save } = window.DT
  const ORDER = ['missing', 'work', 'good', null]
  const LABEL = { good: 'Good', missing: 'Missing', work: 'Need Work', null: 'Não avaliado' }

  const view = {
    plan: () => document.querySelector('.layout'),
    summary: () => document.getElementById('summary'),
    report: () => document.getElementById('report'),
  }

  function grouped() {
    const groups = { missing: [], work: [], good: [], null: [] }
    allTests().forEach((t) => groups[result(t.id).state || 'null'].push(t))
    return groups
  }

  function generatedAt() {
    return new Date().toLocaleString('pt-BR')
  }

  // ---------- HTML report ----------

  function renderReport() {
    const tests = allTests()
    const c = counts(tests)
    const groups = grouped()
    const meta = store.meta
    const rows = plan.areas
      .map((area) => {
        const ac = counts(area.tests)
        return `<tr><td>${rich(area.title)}</td><td>${ac.good}</td><td>${ac.work}</td><td>${ac.missing}</td><td>${ac.pending}</td><td>${ac.total}</td></tr>`
      })
      .join('')
    const item = (t) => {
      const r = result(t.id)
      return `<li><strong>${rich(t.id)}</strong> — ${rich(t.title)} <span class="muted">(${rich(t.area.title)} · ${rich(t.ref || '')})</span>${
        r.note ? `<div class="report__note">${rich(r.note)}</div>` : ''
      }</li>`
    }
    const section = (state, intro) =>
      groups[state].length
        ? `<h3><span class="tag tag--${state || 'pending'}">${LABEL[state]}</span> ${groups[state].length}</h3>
           <p class="muted">${intro}</p><ol>${groups[state].map(item).join('')}</ol>`
        : ''

    view.report().innerHTML = `
      <div class="report__bar no-print">
        <button type="button" id="report-back">← Voltar ao checklist</button>
        <button type="button" id="report-print" class="button--primary">Imprimir / salvar PDF</button>
        <button type="button" id="report-md">Baixar Markdown</button>
        <button type="button" id="report-json">Baixar JSON</button>
      </div>
      <article class="report__doc">
        <h2>Relatório de testes — desafio pleno</h2>
        <dl class="report__meta">
          <dt>Avaliador</dt><dd>${rich(meta.tester || '—')}</dd>
          <dt>Fork / commit</dt><dd>${rich(meta.target || '—')}</dd>
          <dt>Data dos testes</dt><dd>${rich(meta.date || '—')}</dd>
          <dt>Gerado em</dt><dd>${rich(generatedAt())}</dd>
        </dl>
        <p class="report__totals">
          <strong>${c.total - c.pending}/${c.total}</strong> testes avaliados ·
          <span class="tag tag--good">Good ${c.good}</span>
          <span class="tag tag--work">Need Work ${c.work}</span>
          <span class="tag tag--missing">Missing ${c.missing}</span>
          <span class="tag tag--pending">Não avaliados ${c.pending}</span>
        </p>
        <table class="report__table">
          <thead><tr><th>Área</th><th>Good</th><th>Need Work</th><th>Missing</th><th>Não avaliados</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${section('missing', 'Não existe ou não funciona — bloqueia a aprovação do requisito.')}
        ${section('work', 'Existe, mas precisa de ajustes.')}
        ${section('good', 'Atende ao requisito.')}
        ${section(null, 'Ainda não testados.')}
      </article>`

    view.report().querySelector('#report-back').addEventListener('click', closeReport)
    view.report().querySelector('#report-print').addEventListener('click', () => window.print())
    view.report().querySelector('#report-md').addEventListener('click', () => download('relatorio-testes-pleno.md', 'text/markdown', toMarkdown()))
    view.report().querySelector('#report-json').addEventListener('click', () => download('sessao-testes-pleno.json', 'application/json', toJson()))
  }

  function openReport() {
    renderReport()
    view.plan().hidden = true
    view.summary().hidden = true
    view.report().hidden = false
    window.scrollTo(0, 0)
  }

  function closeReport() {
    view.report().hidden = true
    view.plan().hidden = false
    view.summary().hidden = false
  }

  // ---------- exports ----------

  function md(text) {
    return String(text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  }

  function toMarkdown() {
    const tests = allTests()
    const c = counts(tests)
    const groups = grouped()
    const meta = store.meta
    const lines = [
      '# Relatório de testes — desafio pleno',
      '',
      `- **Avaliador:** ${md(meta.tester) || '—'}`,
      `- **Fork / commit:** ${md(meta.target) || '—'}`,
      `- **Data dos testes:** ${md(meta.date) || '—'}`,
      `- **Gerado em:** ${generatedAt()}`,
      '',
      `**${c.total - c.pending}/${c.total} avaliados** · Good ${c.good} · Need Work ${c.work} · Missing ${c.missing} · Não avaliados ${c.pending}`,
      '',
      '| Área | Good | Need Work | Missing | Não avaliados | Total |',
      '|---|---|---|---|---|---|',
      ...plan.areas.map((area) => {
        const ac = counts(area.tests)
        return `| ${md(area.title)} | ${ac.good} | ${ac.work} | ${ac.missing} | ${ac.pending} | ${ac.total} |`
      }),
    ]
    ORDER.forEach((state) => {
      const list = groups[state === null ? 'null' : state]
      if (!list.length) return
      lines.push('', `## ${LABEL[state]} (${list.length})`, '')
      list.forEach((t) => {
        const note = result(t.id).note
        lines.push(`- **${t.id}** — ${md(t.title)} _(${md(t.area.title)} · ${md(t.ref)})_${note ? `\n  - Nota: ${md(note)}` : ''}`)
      })
    })
    return lines.join('\n') + '\n'
  }

  function toJson() {
    const results = Object.fromEntries(
      allTests()
        .filter((t) => store.results[t.id])
        .map((t) => [t.id, store.results[t.id]]),
    )
    return JSON.stringify({ format: 'dt-pleno-v1', exportedAt: new Date().toISOString(), meta: store.meta, results }, null, 2)
  }

  function download(name, type, content) {
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }))
    const link = el('a', { href: url, download: name })
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ---------- import ----------

  function importJson(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (data.format !== 'dt-pleno-v1' || typeof data.results !== 'object') throw new Error('formato inválido')
        const known = new Set(allTests().map((t) => t.id))
        store.meta = { ...(data.meta || {}) }
        store.results = {}
        Object.entries(data.results).forEach(([id, r]) => {
          if (known.has(id) && (r.state === null || stateById[r.state])) store.results[id] = r
        })
        save()
        window.DT.reloadMeta()
        window.DT.reloadNotes()
        window.DT.refresh()
        window.alert(`Sessão importada: ${Object.keys(store.results).length} resultados.`)
      } catch (e) {
        window.alert(`Não foi possível importar: ${e.message}`)
      }
    }
    reader.readAsText(file)
  }

  // ---------- toolbar ----------

  const actions = document.getElementById('actions')
  const input = el('input', { type: 'file', accept: 'application/json,.json', hidden: '' })
  input.addEventListener('change', () => input.files[0] && importJson(input.files[0]))
  const importButton = el('button', { type: 'button', id: 'action-import' }, 'Importar sessão')
  importButton.addEventListener('click', () => input.click())
  const reportButton = el('button', { type: 'button', id: 'action-report', class: 'button--primary' }, 'Gerar relatório')
  reportButton.addEventListener('click', openReport)
  actions.prepend(importButton)
  actions.prepend(reportButton)
  actions.appendChild(input)

  window.DT.toMarkdown = toMarkdown
  window.DT.toJson = toJson
})()
