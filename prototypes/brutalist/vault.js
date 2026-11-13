/* Vault grid: mirrors views/VaultView.vue, MediaCard.vue, AlbumCard.vue. */
(function () {
  'use strict'

  var B = window.BRUTAL
  var M = window.MOCK
  var h = B.h

  function mediaCard(item) {
    var src = M.thumbnail(item)
    var title = item.title || item.type
    return h('button', {
      class: 'card card-' + item.type, type: 'button', title: item.title || '(untitled ' + item.type + ')',
      onclick: function () {
        var p = B.parseHash().params
        p.modal = 'media'
        p.id = String(M.media.indexOf(item))
        B.go(['vault'], p)
      },
    },
      h('span', { class: 'card-thumb' },
        src ? h('img', { src: src, alt: item.title || '', loading: 'lazy' })
            : h('span', { class: 'no-thumb label', text: 'No thumbnail' })),
      h('span', { class: 'card-caption' }, h('span', { class: 'truncate', text: title })),
      h('span', { class: 'sticker label', text: item.type }))
  }

  function albumCard(album) {
    var first = album.media[0]
    var src = first && M.thumbnail(first)
    return h('button', { class: 'card card-album', type: 'button', title: album.title || 'Album' },
      h('span', { class: 'card-thumb' }, src ? h('img', { src: src, alt: album.title || 'Album', loading: 'lazy' }) : null),
      h('span', { class: 'card-caption' },
        h('span', { class: 'truncate', text: album.title || 'Album' }),
        h('span', { class: 'card-sub label', text: album.media.length + ' items' })),
      h('span', { class: 'sticker label', text: 'album' }))
  }

  function tagNames(item) { return (item.tags || []).map(function (t) { return t.name }) }

  /** Same filtering and ordering as VaultView.vue's `entries`. */
  function entries(f) {
    var list = B.store.media.map(function (m) { return { kind: 'media', item: m, created_at: m.created_at } })
      .concat(B.store.albums.map(function (a) { return { kind: 'album', album: a, created_at: a.created_at } }))
    list.sort(function (a, b) { return b.created_at.localeCompare(a.created_at) })
    if (f.type !== 'all') {
      list = list.filter(function (e) { return e.kind === 'album' ? f.type === 'image' : e.item.type === f.type })
    }
    var q = f.search.trim().toLowerCase()
    if (q) {
      list = list.filter(function (e) {
        if (e.kind === 'album') return (e.album.title || '').toLowerCase().indexOf(q) >= 0 || e.album.url.toLowerCase().indexOf(q) >= 0
        return (e.item.title || '').toLowerCase().indexOf(q) >= 0 || e.item.url.toLowerCase().indexOf(q) >= 0 ||
          tagNames(e.item).some(function (t) { return t.toLowerCase().indexOf(q) >= 0 })
      })
    }
    if (f.tags.length) {
      list = list.filter(function (e) {
        var names = e.kind === 'album'
          ? e.album.media.reduce(function (acc, m) { return acc.concat(tagNames(m)) }, [])
          : tagNames(e.item)
        var has = function (t) { return names.indexOf(t) >= 0 }
        return f.mode === 'all' ? f.tags.every(has) : f.tags.some(has)
      })
    }
    return list
  }

  B.pages.vault = function (route) {
    var p = route.params
    var state = p.state // empty | loading | error | undefined
    var f = {
      search: '',
      type: ['video', 'image'].indexOf(p.type) >= 0 ? p.type : 'all',
      tags: p.tags ? p.tags.split(',') : [],
      mode: p.match === 'all' ? 'all' : 'any',
      open: p.filters ? p.filters === '1' : window.matchMedia('(min-width: 768px)').matches,
    }

    var filterBtn = h('button', { class: 'btn', type: 'button', 'aria-controls': 'vault-filters' })
    var panel = h('div', { class: 'filters', id: 'vault-filters' })
    var grid = h('div', { class: 'vault-body' })

    function activeCount() { return f.tags.length + (f.type !== 'all' ? 1 : 0) }

    function renderFilterBtn() {
      B.clear(filterBtn)
      filterBtn.setAttribute('aria-expanded', String(f.open))
      filterBtn.classList.toggle('btn-on', f.open)
      filterBtn.appendChild(h('span', { 'aria-hidden': 'true', class: 'caret' + (f.open ? ' up' : ''), text: '▼' }))
      filterBtn.appendChild(document.createTextNode(f.open ? 'Hide filters' : 'Show filters'))
      if (!f.open && activeCount()) filterBtn.appendChild(h('span', { class: 'count', text: String(activeCount()) }))
      panel.hidden = !f.open
    }

    function renderPanel() {
      B.clear(panel)
      var sel = h('select', { class: 'select', 'aria-label': 'Type', onchange: function (e) { f.type = e.target.value; renderFilterBtn(); renderGrid() } },
        [['all', 'All'], ['video', 'Video'], ['image', 'Image']].map(function (o) {
          return h('option', { value: o[0], selected: f.type === o[0], text: o[1] })
        }))
      var chips = h('div', { class: 'chips' },
        B.store.tags.slice(0, 40).map(function (t) {
          var on = f.tags.indexOf(t.name) >= 0
          return h('button', {
            class: 'chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), text: t.name,
            onclick: function () {
              if (on) f.tags.splice(f.tags.indexOf(t.name), 1)
              else f.tags.push(t.name)
              renderPanel(); renderFilterBtn(); renderGrid()
            },
          })
        }),
        h('button', {
          class: 'chip chip-mode', type: 'button', text: 'match: ' + f.mode,
          onclick: function () { f.mode = f.mode === 'any' ? 'all' : 'any'; renderPanel(); renderGrid() },
        }))
      panel.appendChild(h('div', { class: 'filters-row' }, h('span', { class: 'label', text: 'Type' }), sel))
      panel.appendChild(chips)
    }

    function renderGrid() {
      B.clear(grid)
      if (state === 'error') grid.appendChild(B.stateBlock('error', M.states.vault.error))
      else if (state === 'loading') grid.appendChild(B.stateBlock('loading', M.states.vault.loading))

      var active = state ? [] : M.activeQueue(B.store.queue)
      if (active.length) {
        grid.appendChild(h('h2', { class: 'section-title label', text: 'Downloading · ' + active.length }))
        grid.appendChild(h('div', { class: 'grid' }, active.map(function (q) {
          return h('div', { class: 'pending-card' },
            h('p', { class: 'pending-url truncate', title: q.url, text: q.url }),
            B.progress(q.status, q.progress))
        })))
      }

      var list = state ? [] : entries(f)
      if (list.length) {
        grid.appendChild(h('div', { class: 'grid' }, list.map(function (e) {
          return e.kind === 'media' ? mediaCard(e.item) : albumCard(e.album)
        })))
      }
      if (state !== 'loading' && state !== 'error' && !list.length) {
        grid.appendChild(B.stateBlock('empty', M.states.vault.empty))
      }
    }

    filterBtn.addEventListener('click', function () { f.open = !f.open; renderFilterBtn() })
    renderPanel()
    renderFilterBtn()
    renderGrid()

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: 'Vault' }),
        h('div', { class: 'tools' },
          h('input', {
            class: 'input search', type: 'search', placeholder: 'Search…', 'aria-label': 'Search',
            oninput: function (e) { f.search = e.target.value; renderGrid() },
          }),
          filterBtn,
          h('button', {
            class: 'btn btn-primary', type: 'button', text: 'Add',
            onclick: function () { var q = B.parseHash().params; q.modal = 'add'; B.go(['vault'], q) },
          }))),
      panel,
      grid)
  }
})()
