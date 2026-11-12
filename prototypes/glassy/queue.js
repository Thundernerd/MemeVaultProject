/*
 * Glassy prototype: the Queue view (QueueView.vue). Flags: ?state=empty|loading|error.
 */
(function () {
  'use strict'

  var A = window.GlassApp
  var M = window.MOCK
  var h = A.h

  function queueRow(item, redraw) {
    var active = item.status === 'pending' || item.status === 'downloading'
    var canRetry = ['discord', 'fluxer'].indexOf(item.source) < 0 && (item.status === 'failed' || item.status === 'cancelled')
    var badge = item.source_label
      ? h('span', { class: 'source ' + (item.source === 'discord' || item.source === 'fluxer' ? item.source : 'api') }, item.source_label)
      : null

    return h('article', { class: 'q-item glass' }, [
      h('div', { class: 'q-top' }, [
        h('div', { class: 'q-main' }, [
          h('div', { class: 'q-url' }, [h('p', { class: 'truncate', title: item.url }, item.url), badge]),
          h('p', { class: 'q-status' }, [
            h('span', { class: 'status-dot ' + item.status, 'aria-hidden': 'true' }),
            item.downloader + ' · ', h('b', null, item.status),
          ]),
        ]),
        h('div', { class: 'q-actions' }, [
          active ? h('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: function () { item.status = 'cancelled'; item.error = 'cancelled'; redraw() },
          }, 'Cancel') : null,
          canRetry ? h('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: function () { item.status = 'pending'; item.progress = 0; item.error = null; redraw() },
          }, 'Retry') : null,
          h('button', {
            class: 'btn btn-sm btn-ghost btn-danger', type: 'button',
            onclick: function () { A.db.queue = A.db.queue.filter(function (q) { return q !== item }); redraw() },
          }, 'Remove'),
        ]),
      ]),
      A.progress(item.status, item.progress),
      item.error ? h('p', { class: 'q-error' }, item.error) : null,
    ])
  }

  A.VIEWS.queue = function (r) {
    var state = r.params.get('state')
    var list = h('div', { class: 'page', style: 'gap:12px' })
    var page = h('div', { class: 'page' }, [
      A.pageHead('Queue', h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { A.setParams({ add: '' }) } }, 'Add URL')),
      list,
    ])

    function redraw() {
      list.innerHTML = ''
      if (state === 'error') {
        list.appendChild(A.notice('error', M.states.queue.error, h('a', { class: 'btn btn-sm', href: '#/queue' }, 'Try again')))
        return
      }
      if (state === 'loading') {
        // QueueView.vue has no loading copy yet; this style proposes skeleton rows.
        list.appendChild(h('p', { class: 'muted small', role: 'status' }, M.states.queue.loading))
        for (var i = 0; i < 4; i++) list.appendChild(h('div', { class: 'glass skeleton', style: 'height:84px', 'aria-hidden': 'true' }))
        return
      }
      if (state === 'empty' || !A.db.queue.length) {
        list.appendChild(A.notice('empty', M.states.queue.empty))
        return
      }
      A.db.queue.forEach(function (item) { list.appendChild(queueRow(item, redraw)) })
    }
    redraw()
    return page
  }
})()
