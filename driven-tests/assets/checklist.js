/*
 * Roteiro de testes do desafio pleno — interação: estado de cada teste (Good / Missing / Need Work), notas,
 * progresso, filtros e persistência local (localStorage, só neste navegador).
 */
;(function () {
  'use strict'

  const { plan, allTests, el } = window.DT
  const STORAGE_KEY = 'dt-pleno-v1'

  const STATES = [
    { id: 'good', label: 'Good', hint: 'Atende ao requisito' },
    { id: 'missing', label: 'Missing', hint: 'Não existe ou não funciona' },
    { id: 'work', label: 'Need Work', hint: 'Existe, mas precisa de ajustes' },
  ]
  const stateById = Object.fromEntries(STATES.map((s) => [s.id, s]))

  // ---------- persistence (never trust storage to be available) ----------

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const data = raw ? JSON.parse(raw) : null
      if (data && typeof data === 'object') return { meta: data.meta || {}, results: data.results || {} }
    } catch {
      /* private mode or blocked storage: start empty */
    }
    return { meta: {}, results: {} }
  }

  const store = load()

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }

  function result(id) {
    return store.results[id] || { state: null, note: '' }
  }

  function setResult(id, patch) {
    const next = { ...result(id), ...patch, updatedAt: new Date().toISOString() }
    if (!next.state && !next.note) delete store.results[id]
    else store.results[id] = next
    save()
    refresh()
  }

  // ---------- controls on each card ----------

  function mountControls() {
    allTests().forEach((test) => {
      const card = document.getElementById(`test-${test.id}`)
      const box = card.querySelector('.test__controls')
      const buttons = STATES.map(
        (s) =>
          `<button type="button" class="state state--${s.id}" data-state="${s.id}" title="${s.hint}" aria-pressed="false">${s.label}</button>`,
      ).join('')
      box.innerHTML = `
        <div class="states" role="group" aria-label="Resultado de ${test.id}">
          ${buttons}
          <button type="button" class="state state--clear" data-state="" title="Limpar o resultado">Limpar</button>
        </div>
        <label class="note">
          <span class="muted">Observações</span>
          <textarea rows="2" placeholder="Evidência, o que falta, passos que falharam…"></textarea>
        </label>`
      box.querySelectorAll('[data-state]').forEach((button) =>
        button.addEventListener('click', () => setResult(test.id, { state: button.dataset.state || null })),
      )
      const textarea = box.querySelector('textarea')
      textarea.value = result(test.id).note || ''
      textarea.addEventListener('change', () => setResult(test.id, { note: textarea.value.trim() }))
    })
  }

  // ---------- summary, filters and progress ----------

  const filters = { state: 'all', text: '' }

  function counts(tests) {
    const c = { good: 0, missing: 0, work: 0, pending: 0, total: tests.length }
    tests.forEach((t) => c[result(t.id).state || 'pending']++)
    return c
  }

  function mountSummary() {
    const box = document.getElementById('summary')
    box.innerHTML = `
      <div class="progress" aria-hidden="true">
        <span class="progress__bar progress__bar--good"></span>
        <span class="progress__bar progress__bar--work"></span>
        <span class="progress__bar progress__bar--missing"></span>
      </div>
      <div class="summary__row">
        <p class="summary__counts" id="summary-counts"></p>
        <div class="filters">
          <select id="filter-state" aria-label="Filtrar por resultado">
            <option value="all">Todos os testes</option>
            <option value="pending">Pendentes</option>
            <option value="good">Good</option>
            <option value="work">Need Work</option>
            <option value="missing">Missing</option>
          </select>
          <input id="filter-text" type="search" placeholder="Buscar (id, título, passo)…" aria-label="Buscar" />
        </div>
      </div>`
    box.querySelector('#filter-state').addEventListener('change', (e) => {
      filters.state = e.target.value
      applyFilters()
    })
    box.querySelector('#filter-text').addEventListener('input', (e) => {
      filters.text = e.target.value.trim().toLowerCase()
      applyFilters()
    })
  }

  function matches(test) {
    const state = result(test.id).state || 'pending'
    if (filters.state !== 'all' && filters.state !== state) return false
    if (!filters.text) return true
    const haystack = [test.id, test.title, test.ref, test.expected, ...test.steps].join(' ').toLowerCase()
    return haystack.includes(filters.text)
  }

  function applyFilters() {
    plan.areas.forEach((area) => {
      let visible = 0
      area.tests.forEach((test) => {
        const show = matches(test)
        document.getElementById(`test-${test.id}`).hidden = !show
        if (show) visible++
      })
      document.getElementById(`area-${area.id}`).hidden = visible === 0
    })
  }

  function refresh() {
    const tests = allTests()
    const c = counts(tests)
    const done = c.total - c.pending
    const pct = (n) => (c.total ? (100 * n) / c.total : 0)
    const box = document.getElementById('summary')
    box.querySelector('.progress__bar--good').style.width = `${pct(c.good)}%`
    box.querySelector('.progress__bar--work').style.width = `${pct(c.work)}%`
    box.querySelector('.progress__bar--missing').style.width = `${pct(c.missing)}%`
    box.querySelector('#summary-counts').innerHTML =
      `<strong>${done}/${c.total}</strong> avaliados (${Math.round(pct(done))}%) · ` +
      `<span class="tag tag--good">Good ${c.good}</span> ` +
      `<span class="tag tag--work">Need Work ${c.work}</span> ` +
      `<span class="tag tag--missing">Missing ${c.missing}</span> ` +
      `<span class="tag tag--pending">Pendentes ${c.pending}</span>`

    tests.forEach((test) => {
      const state = result(test.id).state
      const card = document.getElementById(`test-${test.id}`)
      card.dataset.state = state || 'pending'
      card.querySelectorAll('[data-state]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.state === state)))
    })

    plan.areas.forEach((area) => {
      const ac = counts(area.tests)
      const link = document.querySelector(`[data-area-link="${area.id}"] .count`)
      link.textContent = `${ac.total - ac.pending}/${ac.total}`
      link.parentElement.dataset.complete = String(ac.pending === 0)
    })
    applyFilters()
    document.dispatchEvent(new CustomEvent('dt:changed'))
  }

  // ---------- session fields and reset ----------

  function mountMeta() {
    const fields = { tester: 'meta-tester', target: 'meta-target', date: 'meta-date' }
    if (!store.meta.date) store.meta.date = new Date().toISOString().slice(0, 10)
    Object.entries(fields).forEach(([key, id]) => {
      const input = document.getElementById(id)
      input.value = store.meta[key] || ''
      input.addEventListener('change', () => {
        store.meta[key] = input.value.trim()
        save()
      })
    })
  }

  function mountActions() {
    const actions = document.getElementById('actions')
    const reset = el('button', { type: 'button', id: 'action-reset' }, 'Reiniciar')
    reset.addEventListener('click', () => {
      if (!window.confirm('Apagar todos os resultados e notas deste navegador?')) return
      store.results = {}
      save()
      document.querySelectorAll('.note textarea').forEach((t) => (t.value = ''))
      refresh()
    })
    actions.appendChild(reset)
  }

  window.DT.STATES = STATES
  window.DT.stateById = stateById
  window.DT.store = store
  window.DT.result = result
  window.DT.counts = counts
  window.DT.save = save
  window.DT.refresh = () => refresh()
  window.DT.reloadNotes = () =>
    allTests().forEach((t) => {
      document.querySelector(`#test-${t.id} .note textarea`).value = result(t.id).note || ''
    })
  window.DT.reloadMeta = () => {
    document.getElementById('meta-tester').value = store.meta.tester || ''
    document.getElementById('meta-target').value = store.meta.target || ''
    document.getElementById('meta-date').value = store.meta.date || ''
  }

  mountMeta()
  mountSummary()
  mountControls()
  mountActions()
  refresh()
})()
