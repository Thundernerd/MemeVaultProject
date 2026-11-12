/*
 * Brutalist prototype app: a tiny hash router over window.MOCK. No API calls;
 * every action edits an in-memory copy of the mock data and re-renders.
 *
 * Routes:   #/vault  #/queue  #/tags  #/settings/<tab>
 * Params:   ?state=empty|loading|error   (vault, queue)
 *           ?modal=add[&files=1&drag=1]  ?modal=media&id=<index into MOCK.media>
 *           ?filters=1&type=video&tags=a,b   ?drawer=1   ?msg=saved|error   ?reveal=1
 */
(function () {
  'use strict'

  var M = window.MOCK
  var T = window.BRUTAL_THEME
  var view = document.getElementById('view')
  var modalRoot = document.getElementById('modal-root')

  // ------------------------------------------------------------- helpers

  /** h('div', {class, text, onclick, ...attrs}, ...children) */
  function h(tag, props) {
    var el = document.createElement(tag)
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k]
        if (v == null || v === false) return
        if (k === 'class') el.className = v
        else if (k === 'text') el.textContent = v
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
        else if (v === true) el.setAttribute(k, '')
        else el.setAttribute(k, v)
      })
    }
    append(el, Array.prototype.slice.call(arguments, 2))
    return el
  }
  function append(el, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return
      if (Array.isArray(c)) append(el, c)
      else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)))
    })
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild) }

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '')
    var q = raw.indexOf('?')
    var path = (q < 0 ? raw : raw.slice(0, q)).split('/').filter(Boolean)
    var params = {}
    if (q >= 0) {
      raw.slice(q + 1).split('&').forEach(function (pair) {
        if (!pair) return
        var i = pair.indexOf('=')
        var key = decodeURIComponent(i < 0 ? pair : pair.slice(0, i))
        params[key] = i < 0 ? '1' : decodeURIComponent(pair.slice(i + 1))
      })
    }
    if (!path.length) path = ['vault']
    return { path: path, params: params }
  }

  function hashFor(path, params) {
    var qs = Object.keys(params || {})
      .filter(function (k) { return params[k] != null && params[k] !== '' })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]) })
      .join('&')
    return '#/' + path.join('/') + (qs ? '?' + qs : '')
  }
  function go(path, params) { location.hash = hashFor(path, params) }

  // -------------------------------------------------------------- header

  var NAV = [['Vault', 'vault'], ['Queue', 'queue'], ['Tags', 'tags'], ['Settings', 'settings']]
  var ACCENT_HEX = { blue: '#2f5bff', purple: '#9b4dff', green: '#00d26a', orange: '#ff6b00', rose: '#ff2e63' }

  document.getElementById('version').textContent = 'v' + M.version

  function renderNav(route) {
    ;['nav', 'drawer-nav'].forEach(function (id) {
      var nav = document.getElementById(id)
      clear(nav)
      NAV.forEach(function (n) {
        var active = route.path[0] === n[1]
        nav.appendChild(h('a', {
          class: 'nav-link' + (active ? ' active' : ''),
          href: '#/' + (n[1] === 'settings' ? 'settings/general' : n[1]),
          'aria-current': active ? 'page' : null,
          text: n[0],
        }))
      })
    })
  }

  function renderThemeSwitch() {
    var s = T.get()
    var toggle = document.getElementById('theme-toggle')
    toggle.textContent = s.theme === 'dark' ? '☀' : '☾'
    toggle.title = s.theme === 'dark' ? 'Light mode' : 'Dark mode'
    toggle.setAttribute('aria-label', toggle.title)
    var sw = document.getElementById('swatches')
    clear(sw)
    T.accents.forEach(function (a) {
      sw.appendChild(h('button', {
        class: 'swatch', type: 'button', title: a, 'aria-label': 'Accent ' + a,
        'aria-pressed': String(s.accent === a), style: 'background:' + ACCENT_HEX[a],
        onclick: function () { T.setAccent(a) },
      }))
    })
  }
  document.getElementById('theme-toggle').addEventListener('click', function () { T.toggleTheme() })
  T.onChange(renderThemeSwitch)
  renderThemeSwitch()

  var drawer = document.getElementById('drawer')
  var menuBtn = document.getElementById('menu-btn')
  function setDrawer(open) {
    drawer.hidden = !open
    menuBtn.setAttribute('aria-expanded', String(open))
    menuBtn.textContent = open ? '✕' : '☰'
  }
  menuBtn.addEventListener('click', function () { setDrawer(drawer.hidden) })
  drawer.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close-drawer') || e.target.classList.contains('nav-link')) setDrawer(false)
  })

  // --------------------------------------------------------------- pages

  var pages = {}
  var modals = {}

  function notFound(route) {
    return h('div', { class: 'page' },
      h('h1', { text: 'Not found' }),
      h('p', { class: 'muted' }, 'No screen at #/' + route.path.join('/') + '. ', h('a', { href: '#/vault', text: 'Back to the vault' })))
  }

  // -------------------------------------------------------------- router

  // Params that only open something over the page; changing them keeps the page.
  var OVERLAY_PARAMS = ['modal', 'id', 'files', 'drag', 'drawer']
  var lastPage = null
  function render() {
    var route = parseHash()
    renderNav(route)
    setDrawer(route.params.drawer === '1')

    // Re-render the page only when the page itself changed, so opening a
    // modal over the vault keeps its search, filters and scroll position.
    var pageKey = route.path.join('/') + '?' + Object.keys(route.params).sort()
      .filter(function (k) { return OVERLAY_PARAMS.indexOf(k) < 0 })
      .map(function (k) { return k + '=' + route.params[k] }).join('&')
    if (pageKey !== lastPage) {
      lastPage = pageKey
      clear(view)
      var page = pages[route.path[0]]
      view.appendChild(page ? page(route) : notFound(route))
    }

    clear(modalRoot)
    document.body.style.overflow = ''
    var modal = modals[route.params.modal]
    if (modal) {
      modalRoot.appendChild(modal(route))
      document.body.style.overflow = 'hidden'
      var focusable = modalRoot.querySelector('[data-autofocus]') || modalRoot.querySelector('button')
      if (focusable) focusable.focus()
    }
  }

  /** Close the open modal, keeping the page route underneath. */
  function closeModal() {
    var route = parseHash()
    var p = {}
    Object.keys(route.params).forEach(function (k) {
      if (OVERLAY_PARAMS.indexOf(k) < 0) p[k] = route.params[k]
    })
    go(route.path, p)
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && parseHash().params.modal) closeModal()
  })

  // ---------------------------------------------------- shared pieces

  /** In-memory copy of the mock data that actions edit. Reloading resets it. */
  var store = {
    media: M.media.slice(),
    albums: M.albums.slice(),
    queue: M.queue.map(function (q) { return Object.assign({}, q) }),
    tags: M.tags.map(function (t) { return Object.assign({}, t) }),
    shares: M.shares.slice(),
  }

  /** Mirrors components/DownloadProgress.vue: nothing unless pending/downloading. */
  function progress(status, value) {
    if (status !== 'pending' && status !== 'downloading') return null
    var indeterminate = status === 'downloading' && value < 1
    var label = status === 'pending' ? 'Waiting'
      : value >= 99 ? 'Processing…'
      : value < 1 ? 'Starting…'
      : Math.round(value) + '%'
    var pct = Math.max(0, Math.min(100, value))
    return h('div', { class: 'progress' },
      h('p', { class: 'label progress-label', text: label }),
      h('div', {
        class: 'progress-track' + (indeterminate ? ' indeterminate' : '') + (status === 'pending' ? ' waiting' : ''),
        role: 'progressbar', 'aria-label': label,
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': indeterminate ? null : String(Math.round(pct)),
      }, h('div', { class: 'progress-fill', style: indeterminate ? null : 'width:' + pct + '%' })))
  }

  /** A full-width message block for empty / loading / error states. */
  function stateBlock(kind, text) {
    return h('div', { class: 'state state-' + kind, role: kind === 'error' ? 'alert' : 'status' },
      h('span', { class: 'state-tag label', text: kind }),
      h('p', { class: 'state-text', text: text }))
  }

  window.BRUTAL = {
    h: h, clear: clear, go: go, parseHash: parseHash, hashFor: hashFor, pages: pages, modals: modals,
    closeModal: closeModal, store: store, progress: progress, stateBlock: stateBlock,
  }
  window.addEventListener('hashchange', render)
  window.addEventListener('DOMContentLoaded', render)
})()
