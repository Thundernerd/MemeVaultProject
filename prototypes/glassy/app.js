/*
 * Glassy prototype: a tiny hash router and plain-DOM views over window.MOCK.
 * Throwaway exploration (issue #12); nothing here talks to a real API.
 *
 * Routes:   #/vault  #/queue  #/tags  #/settings/<tab>
 * Flags:    ?state=empty|loading|error      (vault, queue)
 *           ?add[&drag][&files]              Add to vault modal
 *           ?media=<id>                      Media detail modal
 *           ?msg=saved|error  ?reveal        Settings messages, API key reveal
 *           ?drawer                          open the mobile drawer
 */
(function () {
  'use strict'

  var M = window.MOCK
  var T = window.GlassTheme

  // ---------------------------------------------------------------- helpers

  /** h('div', {class: 'x', onclick: fn}, [children…]) → Element */
  function h(tag, attrs, children) {
    var el = document.createElement(tag)
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k]
        if (v == null || v === false) return
        if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
        else if (k === 'class') el.className = v
        else if (k === 'html') el.innerHTML = v // only ever static markup from this file
        else if (k in el && typeof v !== 'string') el[k] = v
        else el.setAttribute(k, v === true ? '' : v)
      })
    }
    ;[].concat(children == null ? [] : children).forEach(function (c) {
      if (c == null || c === false) return
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
    })
    return el
  }

  function icon(path, size) {
    var s = size || 16
    return h('span', {
      'aria-hidden': 'true',
      html: '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block">' + path + '</svg>',
    })
  }
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    upload: '<path d="M12 18V6M6 12l6-6 6 6"/><path d="M3 20h18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4-2.5z"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  }

  function fmtDate(iso) {
    if (!iso) return 'never'
    var d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  // ------------------------------------------------------------------ state

  // In-memory copies, so actions (delete, cancel, purge…) visibly do something
  // until the page reloads.
  var db = {
    media: M.media.slice(),
    albums: M.albums.map(function (a) { return Object.assign({}, a, { media: a.media.slice() }) }),
    queue: M.queue.map(function (q) { return Object.assign({}, q) }),
    tags: M.tags.map(function (t) { return Object.assign({}, t) }),
    shares: M.shares.slice(),
  }

  var vault = {
    search: '',
    type: 'all',
    selectedTags: [],
    mode: 'any',
    filtersOpen: window.matchMedia('(min-width: 768px)').matches,
  }

  // ------------------------------------------------------------------ router

  function parseRoute() {
    var raw = location.hash.replace(/^#\/?/, '')
    var qi = raw.indexOf('?')
    var path = (qi >= 0 ? raw.slice(0, qi) : raw).split('/').filter(Boolean)
    var params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '')
    return { path: path.length ? path : ['vault'], params: params }
  }

  /** Navigate to the current path with params changed (null removes one). */
  function setParams(changes) {
    var r = parseRoute()
    Object.keys(changes).forEach(function (k) {
      if (changes[k] == null) r.params.delete(k)
      else r.params.set(k, changes[k])
    })
    var qs = r.params.toString().replace(/=(&|$)/g, '$1')
    location.hash = '#/' + r.path.join('/') + (qs ? '?' + qs : '')
  }

  /** Drops every modal flag (?add, ?drag, ?files, ?media) from the route. */
  function closeModals() { setParams({ add: null, drag: null, files: null, media: null }) }

  var VIEWS = {}
  var MODALS = []

  // ------------------------------------------------------------------ shell

  var LINKS = [
    { href: '#/vault', label: 'Vault', key: 'vault' },
    { href: '#/queue', label: 'Queue', key: 'queue' },
    { href: '#/tags', label: 'Tags', key: 'tags' },
    { href: '#/settings/general', label: 'Settings', key: 'settings' },
  ]

  function renderNav(container, key, onNavigate) {
    container.innerHTML = ''
    LINKS.forEach(function (l) {
      container.appendChild(h('a', {
        href: l.href,
        'aria-current': l.key === key ? 'page' : null,
        onclick: onNavigate,
      }, l.label))
    })
  }

  function setDrawer(open) {
    document.getElementById('drawer').hidden = !open
    document.getElementById('menu-btn').setAttribute('aria-expanded', String(open))
  }

  function initShell() {
    document.getElementById('version').textContent = 'v' + M.version
    T.mountSwitcher(document.getElementById('switcher'))
    document.getElementById('menu-btn').addEventListener('click', function () {
      setDrawer(document.getElementById('drawer').hidden)
    })
    document.getElementById('drawer-backdrop').addEventListener('click', function () { setDrawer(false) })
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return
      setDrawer(false)
      var r = parseRoute()
      if (r.params.has('add') || r.params.has('media')) closeModals()
    })
  }

  // ---------------------------------------------------- shared view pieces

  /** DownloadProgress.vue: label + bar while pending or downloading. */
  function progress(status, value) {
    if (status !== 'pending' && status !== 'downloading') return null
    var indeterminate = status === 'downloading' && value < 1
    var label = status === 'pending' ? 'Waiting'
      : value >= 99 ? 'Processing…'
        : value < 1 ? 'Starting…'
          : Math.round(value) + '%'
    var bar = indeterminate
      ? h('div', { class: 'progress-bar indeterminate' })
      : h('div', { class: 'progress-bar', style: 'width:' + Math.max(0, Math.min(100, value)) + '%' })
    return h('div', { class: 'progress' }, [
      h('p', { class: 'progress-label' }, label),
      h('div', {
        class: 'progress-track', role: 'progressbar', 'aria-label': label,
        'aria-valuemin': '0', 'aria-valuemax': '100',
        'aria-valuenow': indeterminate || status === 'pending' ? null : String(Math.round(value)),
      }, bar),
    ])
  }

  function notice(kind, text, action) {
    return h('div', { class: 'notice glass ' + kind, role: kind === 'error' ? 'alert' : 'status' }, [
      h('div', { class: 'notice-icon' }, icon(kind === 'error' ? ICONS.alert : ICONS.inbox, 22)),
      h('p', { class: kind === 'error' ? 'danger' : 'secondary' }, text),
      action || null,
    ])
  }

  function pageHead(title, actions) {
    return h('div', { class: 'page-head' }, [
      h('h1', { class: 'page-title' }, title),
      h('div', { class: 'page-actions' }, actions),
    ])
  }

  // ------------------------------------------------------------------ vault

  function activeFilterCount() {
    return vault.selectedTags.length + (vault.type !== 'all' ? 1 : 0)
  }

  function vaultEntries() {
    var list = db.media.map(function (m) { return { kind: 'media', item: m, created_at: m.created_at } })
      .concat(db.albums.map(function (a) { return { kind: 'album', album: a, created_at: a.created_at } }))
    list.sort(function (a, b) { return b.created_at.localeCompare(a.created_at) })

    if (vault.type !== 'all') {
      list = list.filter(function (e) {
        return e.kind === 'album' ? vault.type === 'image' : e.item.type === vault.type
      })
    }
    var q = vault.search.trim().toLowerCase()
    if (q) {
      list = list.filter(function (e) {
        if (e.kind === 'album') return (e.album.title || '').toLowerCase().indexOf(q) >= 0 || e.album.url.toLowerCase().indexOf(q) >= 0
        return (e.item.title || '').toLowerCase().indexOf(q) >= 0 ||
          e.item.url.toLowerCase().indexOf(q) >= 0 ||
          e.item.tags.some(function (t) { return t.name.toLowerCase().indexOf(q) >= 0 })
      })
    }
    if (vault.selectedTags.length) {
      list = list.filter(function (e) {
        var names = e.kind === 'album'
          ? [].concat.apply([], e.album.media.map(function (m) { return m.tags.map(function (t) { return t.name }) }))
          : e.item.tags.map(function (t) { return t.name })
        var has = function (t) { return names.indexOf(t) >= 0 }
        return vault.mode === 'all' ? vault.selectedTags.every(has) : vault.selectedTags.some(has)
      })
    }
    return list
  }

  function mediaCard(item) {
    var src = M.thumbnail(item)
    return h('button', {
      class: 'card', type: 'button',
      'aria-label': (item.title || 'Untitled ' + item.type) + ', ' + item.type,
      onclick: function () { setParams({ media: item.id }) },
    }, [
      src ? h('img', { src: src, alt: item.title || '', loading: 'lazy' }) : h('div', { class: 'nothumb' }, icon(ICONS.film, 28)),
      h('div', { class: 'card-caption' }, h('p', { class: 'truncate', title: item.title || item.type }, item.title || item.type)),
      h('span', { class: 'badge' }, item.type),
    ])
  }

  function albumCard(album) {
    var first = album.media[0]
    var src = first ? M.thumbnail(first) : null
    // AlbumCard.vue emits click but VaultView does not open anything yet.
    return h('button', { class: 'card album', type: 'button', 'aria-label': (album.title || 'Album') + ', album, ' + album.media.length + ' items' }, [
      src ? h('img', { src: src, alt: album.title || 'Album', loading: 'lazy' }) : null,
      h('div', { class: 'card-caption' }, [
        h('p', { class: 'truncate', title: album.title || 'Album' }, album.title || 'Album'),
        h('p', { class: 'sub' }, album.media.length + ' items'),
      ]),
      h('span', { class: 'badge' }, 'album'),
    ])
  }

  function renderVaultGrid(container) {
    container.innerHTML = ''
    var entries = vaultEntries()
    if (!entries.length) {
      container.appendChild(notice('empty', M.states.vault.empty))
      return
    }
    var grid = h('div', { class: 'grid' })
    entries.forEach(function (e) { grid.appendChild(e.kind === 'media' ? mediaCard(e.item) : albumCard(e.album)) })
    container.appendChild(grid)
  }

  function filterPanel(onChange) {
    var typeSelect = h('select', {
      class: 'field', 'aria-label': 'Type',
      onchange: function (e) { vault.type = e.target.value; onChange() },
    }, [['all', 'All'], ['video', 'Video'], ['image', 'Image']].map(function (o) {
      return h('option', { value: o[0], selected: vault.type === o[0] }, o[1])
    }))

    var chips = h('div', { class: 'filters-row' })
    function drawChips() {
      chips.innerHTML = ''
      db.tags.slice(0, 40).forEach(function (t) {
        chips.appendChild(h('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(vault.selectedTags.indexOf(t.name) >= 0),
          onclick: function () {
            var i = vault.selectedTags.indexOf(t.name)
            if (i >= 0) vault.selectedTags.splice(i, 1)
            else vault.selectedTags.push(t.name)
            drawChips()
            onChange()
          },
        }, h('span', null, t.name)))
      })
      chips.appendChild(h('button', {
        class: 'match-toggle', type: 'button',
        onclick: function () { vault.mode = vault.mode === 'any' ? 'all' : 'any'; drawChips(); onChange() },
      }, 'match: ' + vault.mode))
    }
    drawChips()

    return h('div', { class: 'filters glass', id: 'vault-filters', hidden: !vault.filtersOpen }, [
      h('div', { class: 'filters-row' }, [h('span', { class: 'filters-label' }, 'Type'), typeSelect]),
      h('span', { class: 'filters-label' }, 'Tags'),
      chips,
    ])
  }

  VIEWS.vault = function (r) {
    var state = r.params.get('state')
    var gridHost = h('div')
    var refresh = function () { renderVaultGrid(gridHost); drawToggle() }

    var toggle = h('button', {
      class: 'btn toggle-btn', type: 'button', 'aria-controls': 'vault-filters',
      onclick: function () {
        vault.filtersOpen = !vault.filtersOpen
        panel.hidden = !vault.filtersOpen
        drawToggle()
      },
    })
    function drawToggle() {
      toggle.setAttribute('aria-expanded', String(vault.filtersOpen))
      toggle.innerHTML = ''
      toggle.appendChild(h('span', { class: 'chevron' }, icon(ICONS.chevron, 14)))
      toggle.appendChild(document.createTextNode(vault.filtersOpen ? 'Hide filters' : 'Show filters'))
      var n = activeFilterCount()
      if (!vault.filtersOpen && n) toggle.appendChild(h('span', { class: 'count' }, String(n)))
    }

    var search = h('label', { class: 'search' }, [
      h('span', { class: 'sr-only' }, 'Search'),
      icon(ICONS.search, 15),
      h('input', {
        class: 'field', type: 'search', placeholder: 'Search…', value: vault.search,
        oninput: function (e) { vault.search = e.target.value; renderVaultGrid(gridHost) },
      }),
    ])

    var panel = filterPanel(refresh)
    drawToggle()

    var page = h('div', { class: 'page' }, [
      pageHead('Vault', [
        search,
        toggle,
        h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { setParams({ add: '' }) } }, 'Add'),
      ]),
      panel,
    ])

    if (state === 'error') {
      page.appendChild(notice('error', M.states.vault.error,
        h('a', { class: 'btn btn-sm', href: '#/vault' }, 'Try again')))
      return page
    }
    if (state === 'loading') {
      page.appendChild(h('p', { class: 'muted small', role: 'status' }, M.states.vault.loading))
      var sk = h('div', { class: 'grid', 'aria-hidden': 'true' })
      for (var i = 0; i < 8; i++) sk.appendChild(h('div', { class: 'card skeleton' }))
      page.appendChild(sk)
      return page
    }
    if (state === 'empty') {
      page.appendChild(notice('empty', M.states.vault.empty,
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: function () { setParams({ add: '' }) } }, 'Add')))
      return page
    }

    // MOCK.activeQueue() over the live copy, so Queue download, Retry and Cancel
    // show up here.
    var active = M.activeQueue(db.queue)
    if (active.length) {
      var dl = h('div', { class: 'grid' })
      active.forEach(function (q) {
        dl.appendChild(h('div', { class: 'dl-card' }, [
          h('p', { class: 'url truncate', title: q.url }, q.url),
          progress(q.status, q.progress),
        ]))
      })
      page.appendChild(dl)
    }

    renderVaultGrid(gridHost)
    page.appendChild(gridHost)
    return page
  }

  // ------------------------------------------------------------------ render

  var lastView = null

  function render() {
    var r = parseRoute()
    var key = VIEWS[r.path[0]] ? r.path[0] : 'vault'
    var closeDrawer = function () { setDrawer(false) }
    renderNav(document.getElementById('nav'), key)
    renderNav(document.getElementById('drawer-nav'), key, closeDrawer)
    setDrawer(r.params.has('drawer'))

    // Re-render the page only when the path changed, so opening a modal
    // keeps the vault's scroll position and filters.
    var viewKey = r.path.join('/') + '|' + (r.params.get('state') || '') + '|' + (r.params.get('msg') || '') + '|' + r.params.has('reveal')
    if (viewKey !== lastView) {
      var main = document.getElementById('main')
      main.innerHTML = ''
      main.appendChild(VIEWS[key](r))
      if (lastView && lastView.split('|')[0] !== r.path.join('/')) window.scrollTo(0, 0)
      lastView = viewKey
      document.title = LINKS.filter(function (l) { return l.key === key })[0].label + ' · MVP · Glassy prototype'
    }

    var root = document.getElementById('modal-root')
    root.innerHTML = ''
    MODALS.forEach(function (m) {
      var el = m(r)
      if (el) root.appendChild(el)
    })
    document.body.style.overflow = root.children.length ? 'hidden' : ''
  }

  // Exposed for the later slices of this file (modals, other views).
  window.GlassApp = { h: h, icon: icon, ICONS: ICONS, db: db, VIEWS: VIEWS, MODALS: MODALS, setParams: setParams, closeModals: closeModals, parseRoute: parseRoute, progress: progress, notice: notice, pageHead: pageHead, fmtDate: fmtDate, render: render, invalidate: function () { lastView = null } }

  initShell()
  window.addEventListener('hashchange', render)
  document.addEventListener('DOMContentLoaded', render)
})()
