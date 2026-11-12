/*
 * Glassy prototype: the Tags view (TagsView.vue), grouped by namespace.
 */
(function () {
  'use strict'

  var A = window.GlassApp
  var h = A.h

  function grouped() {
    var map = {}
    A.db.tags.forEach(function (t) {
      var ns = t.name.indexOf(':') >= 0 ? t.name.split(':')[0] : 'other'
      ;(map[ns] = map[ns] || []).push(t)
    })
    return Object.keys(map).sort().map(function (ns) { return [ns, map[ns]] })
  }

  A.VIEWS.tags = function () {
    var body = h('div', { class: 'page', style: 'gap:14px' })

    function redraw() {
      body.innerHTML = ''
      if (!A.db.tags.length) {
        body.appendChild(A.notice('empty', 'No tags yet'))
        return
      }
      grouped().forEach(function (g) {
        body.appendChild(h('section', { class: 'tag-group glass', 'aria-label': g[0] }, [
          h('h2', null, g[0]),
          h('div', { class: 'tag-list' }, g[1].map(function (t) {
            return h('div', { class: 'tag' }, [
              h('span', { class: 'truncate', title: t.name }, t.name),
              h('span', { class: 'n' + (t.usage_count === 0 ? ' zero' : ''), title: t.usage_count + ' uses' }, String(t.usage_count)),
              h('button', {
                class: 'x', type: 'button', 'aria-label': 'Delete tag ' + t.name,
                onclick: function () { A.db.tags = A.db.tags.filter(function (x) { return x !== t }); redraw() },
              }, '✕'),
            ])
          })),
        ]))
      })
    }
    redraw()

    return h('div', { class: 'page' }, [
      A.pageHead('Tags', h('button', {
        class: 'btn', type: 'button',
        onclick: function () { A.db.tags = A.db.tags.filter(function (t) { return t.usage_count > 0 }); redraw() },
      }, 'Purge unused')),
      body,
    ])
  }
})()
