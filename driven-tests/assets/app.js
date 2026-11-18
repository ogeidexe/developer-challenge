/* Roteiro de testes do desafio pleno — renderização do checklist a partir de window.TEST_PLAN. */
;(function () {
  'use strict'

  const plan = window.TEST_PLAN || { areas: [] }
  const allTests = () => plan.areas.flatMap((area) => area.tests.map((test) => ({ ...test, area })))

  /** Escapes HTML, then turns `inline code` into <code>. */
  function rich(text) {
    const escaped = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    return escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
  }

  function el(tag, attrs, html) {
    const node = document.createElement(tag)
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, value)
    })
    if (html !== undefined) node.innerHTML = html
    return node
  }

  /** "Tela" and "Usuário" chips: where the step happens and who does it (walkthrough). */
  function where(test) {
    const chips = []
    if (test.screen) chips.push(`<span class="chip chip--screen">Tela: ${rich(test.screen)}</span>`)
    if (test.user) chips.push(`<span class="chip chip--user">Usuário: ${rich(test.user)}</span>`)
    return chips.length ? `<p class="test__where">${chips.join(' ')}</p>` : ''
  }

  function renderTest(test) {
    const card = el('article', { class: 'test', id: `test-${test.id}`, 'data-test': test.id })
    card.innerHTML = `
      <div class="test__head">
        <span class="test__id">${rich(test.id)}</span>
        <h3 class="test__title">${rich(test.title)}</h3>
      </div>
      <p class="test__ref">${rich(test.ref || '')}</p>
      ${where(test)}
      <ol>${test.steps.map((step) => `<li>${rich(step)}</li>`).join('')}</ol>
      <p class="test__expected"><strong>Esperado:</strong>${rich(test.expected)}</p>
      <div class="test__controls"></div>`
    return card
  }

  function renderPlan() {
    const root = document.getElementById('plan')
    const sidebar = document.getElementById('sidebar')
    root.innerHTML = ''
    sidebar.innerHTML = ''
    plan.areas.forEach((area) => {
      const section = el('section', { class: 'area', id: `area-${area.id}`, 'data-area': area.id })
      const header = el('div', { class: 'area__header' })
      header.innerHTML = `<h2>${rich(area.title)}</h2><span class="muted">${rich(area.ref || '')}</span>`
      section.appendChild(header)
      if (area.intro) section.appendChild(el('p', { class: 'area__intro' }, rich(area.intro)))
      area.tests.forEach((test) => section.appendChild(renderTest(test)))
      root.appendChild(section)

      const link = el('a', { href: `#area-${area.id}`, 'data-area-link': area.id })
      link.innerHTML = `<span>${rich(area.title)}</span><span class="count">${area.tests.length}</span>`
      sidebar.appendChild(link)
    })
  }

  // shared with the interaction and report layers
  window.DT = { plan, allTests, rich, el }

  renderPlan()
  document.dispatchEvent(new CustomEvent('dt:rendered'))
})()
