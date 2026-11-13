/* Queue (views/QueueView.vue) and Tags (views/TagsView.vue). */
(function () {
  'use strict'

  var B = window.BRUTAL
  var M = window.MOCK
  var h = B.h

  function openAdd() { var p = B.parseHash().params; p.modal = 'add'; B.go(B.parseHash().path, p) }

  // ----------------------------------------------------------------- queue

  B.pages.queue = function (route) {
    var state = route.params.state
    var list = h('div', { class: 'queue' })

    function row(item) {
      var active = item.status === 'pending' || item.status === 'downloading'
      var canRetry = ['discord', 'fluxer'].indexOf(item.source) < 0 && (item.status === 'failed' || item.status === 'cancelled')
      return h('article', { class: 'q-row q-' + item.status },
        h('span', { class: 'q-status label', text: item.status }),
        h('div', { class: 'q-main' },
          h('div', { class: 'q-top' },
            h('div', { class: 'q-info' },
              h('div', { class: 'q-url-line' },
                h('p', { class: 'q-url truncate', title: item.url, text: item.url }),
                item.source_label ? h('span', { class: 'badge label badge-' + item.source, text: item.source_label }) : null),
              h('p', { class: 'q-meta label', text: item.downloader + ' · ' + item.status })),
            h('div', { class: 'q-actions' },
              active ? h('button', {
                class: 'btn btn-sm', type: 'button', text: 'Cancel',
                onclick: function () { item.status = 'cancelled'; item.error = 'cancelled'; render() },
              }) : null,
              canRetry ? h('button', {
                class: 'btn btn-sm', type: 'button', text: 'Retry',
                onclick: function () { item.status = 'pending'; item.progress = 0; item.error = null; render() },
              }) : null,
              h('button', {
                class: 'btn btn-sm btn-danger', type: 'button', text: 'Remove',
                onclick: function () { B.store.queue.splice(B.store.queue.indexOf(item), 1); render() },
              }))),
          B.progress(item.status, item.progress),
          item.error ? h('p', { class: 'q-error', text: item.error }) : null))
    }

    function render() {
      B.clear(list)
      if (state === 'error') return list.appendChild(B.stateBlock('error', M.states.queue.error))
      if (state === 'loading') return list.appendChild(B.stateBlock('loading', M.states.queue.loading))
      var items = state === 'empty' ? [] : B.store.queue
      if (!items.length) return list.appendChild(B.stateBlock('empty', M.states.queue.empty))
      items.forEach(function (it) { list.appendChild(row(it)) })
    }
    render()

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: 'Queue' }),
        h('div', { class: 'tools' }, h('button', { class: 'btn btn-primary', type: 'button', text: 'Add URL', onclick: openAdd }))),
      list)
  }

  // ------------------------------------------------------------------ tags

  B.pages.tags = function () {
    var body = h('div', { class: 'tag-groups' })

    function render() {
      B.clear(body)
      var groups = {}
      var order = []
      B.store.tags.forEach(function (t) {
        var i = t.name.indexOf(':')
        var ns = i > 0 ? t.name.slice(0, i) : 'other'
        if (!groups[ns]) { groups[ns] = []; order.push(ns) }
        groups[ns].push(t)
      })
      order.sort(function (a, b) { return a.localeCompare(b) }) // as TagsView.vue
      if (!order.length) body.appendChild(B.stateBlock('empty', M.states.tags.empty))
      order.forEach(function (ns) {
        body.appendChild(h('section', { class: 'tag-group' },
          h('h2', { class: 'tag-ns' }, h('span', { text: ns }), h('span', { class: 'label muted', text: groups[ns].length + '' })),
          h('div', { class: 'tag-list' }, groups[ns].map(function (t) {
            return h('div', { class: 'tag' + (t.usage_count ? '' : ' tag-unused') },
              h('span', { class: 'tag-name', title: t.name, text: t.name }),
              h('span', { class: 'tag-count', title: t.usage_count + ' items', text: String(t.usage_count) }),
              h('button', {
                class: 'tag-del', type: 'button', 'aria-label': 'Delete tag ' + t.name, text: '✕',
                onclick: function () { B.store.tags.splice(B.store.tags.indexOf(t), 1); render() },
              }))
          }))))
      })
    }
    render()

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: 'Tags' }),
        h('div', { class: 'tools' }, h('button', {
          class: 'btn', type: 'button', text: 'Purge unused',
          onclick: function () {
            B.store.tags = B.store.tags.filter(function (t) { return t.usage_count > 0 })
            render()
          },
        }))),
      body)
  }
})()
