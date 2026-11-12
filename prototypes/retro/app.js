/*
 * Retro / Y2K prototype of MemeVault: a hash router over window.MOCK.
 * Throwaway code: plain DOM, no framework, no network. Changes (adding tags,
 * cancelling downloads, …) only live in memory until the page reloads.
 *
 * Routes:  #/vault  #/queue  #/tags  #/settings/<tab>
 * Params:  state=empty|loading|error   (vault, queue)
 *          modal=add [&demo=drag|files]  modal=media&id=<media id>
 *          msg=saved|error              (settings)
 */
(function () {
  'use strict'

  var M = window.MOCK
  var px = window.PixelFont.render
  var icon = window.Icons.render
  var Theme = window.RetroTheme

  // ------------------------------------------------------------ helpers

  /** h('div', {class: 'x', onclick: fn}, [children]) */
  function h(tag, props, kids) {
    var e = document.createElement(tag)
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k]
        if (v == null || v === false) return
        if (k === 'class') e.className = v
        else if (k === 'text') e.textContent = v
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v)
        else if (k === 'value') e.value = v
        else if (k === 'checked') e.checked = !!v
        else e.setAttribute(k, v === true ? '' : v)
      })
    }
    append(e, kids)
    return e
  }
  function append(e, kids) {
    if (kids == null || kids === false) return
    if (Array.isArray(kids)) kids.forEach(function (k) { append(e, k) })
    else e.appendChild(typeof kids === 'string' || typeof kids === 'number' ? document.createTextNode(String(kids)) : kids)
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild) }
  function clone(o) { return JSON.parse(JSON.stringify(o)) }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function fmtDate(iso) {
    if (!iso) return '—'
    var d = new Date(iso)
    var pad = function (n) { return (n < 10 ? '0' : '') + n }
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes())
  }

  /** A window: title bar with a bitmap title, optional close, then the body. */
  function win(title, opts, body) {
    opts = opts || {}
    var controls = h('div', { class: 'controls' }, [
      opts.onClose ? null : h('span', { class: 'tb-btn', 'aria-hidden': 'true' }, '_'),
      opts.onClose ? null : h('span', { class: 'tb-btn', 'aria-hidden': 'true' }, '□'),
      h(opts.onClose ? 'button' : 'span', opts.onClose
        ? { class: 'tb-btn', type: 'button', 'aria-label': 'Close', onclick: opts.onClose }
        : { class: 'tb-btn', 'aria-hidden': 'true' }, '×'),
    ])
    return h('section', { class: 'win' + (opts.class ? ' ' + opts.class : ''), 'aria-label': opts.label || title }, [
      h('div', { class: 'titlebar' }, [
        h('div', { class: 'title' }, [opts.icon ? icon(opts.icon) : null, px(title)]),
        controls,
      ]),
      opts.menu ? h('div', { class: 'menubar', 'aria-hidden': 'true' }, opts.menu.map(function (m) {
        return h('span', null, [h('u', null, m[0]), m.slice(1)])
      })) : null,
      h('div', { class: 'win-body' + (opts.bodyClass ? ' ' + opts.bodyClass : '') }, body),
      opts.status ? h('div', { class: 'statusbar' }, opts.status) : null,
    ])
  }

  // -------------------------------------------------------------- state

  var S = {
    media: clone(M.media),
    albums: clone(M.albums),
    queue: clone(M.queue),
    tags: clone(M.tags),
    shares: clone(M.shares),
    settings: clone(M.settings),
    apiKeys: clone(M.apiKeys),
    cookies: clone(M.cookies),
  }

  // ------------------------------------------------------------- router

  var NAV = [
    { href: '#/vault', label: 'Vault', icon: 'vault' },
    { href: '#/queue', label: 'Queue', icon: 'queue' },
    { href: '#/tags', label: 'Tags', icon: 'tags' },
    { href: '#/settings/general', label: 'Settings', icon: 'settings' },
  ]

  function route() {
    var raw = location.hash.replace(/^#\/?/, '')
    var qi = raw.indexOf('?')
    var path = (qi >= 0 ? raw.slice(0, qi) : raw).split('/').filter(Boolean)
    var q = {}
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=')
        if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '')
      })
    }
    if (!path.length || !VIEWS[path[0]]) path = ['vault']
    return { path: path, q: q }
  }

  /** The current route with some params changed (null removes one). */
  function withParams(changes) {
    var r = route()
    Object.keys(changes).forEach(function (k) {
      if (changes[k] == null) delete r.q[k]
      else r.q[k] = changes[k]
    })
    var qs = Object.keys(r.q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(r.q[k]) }).join('&')
    return '#/' + r.path.join('/') + (qs ? '?' + qs : '')
  }
  function go(hash) { location.hash = hash }

  var VIEWS = {
    vault: function (r) { return stub('Vault', r) },
    queue: function (r) { return stub('Queue', r) },
    tags: function (r) { return stub('Tags', r) },
    settings: function (r) { return stub('Settings', r) },
  }

  function stub(title, r) {
    return win('C:\\MemeVault\\' + title, { icon: 'folder' }, [
      h('div', { class: 'page-head' }, [h('h1', null, px(title))]),
      h('p', null, 'Coming up in the next slice. Route: ' + r.path.join('/')),
    ])
  }

  // ------------------------------------------------------------- header

  function themeSwitch() {
    var wrap = h('div', { class: 'theme-switch' })
    function paint() {
      clear(wrap)
      var dark = Theme.theme === 'dark'
      wrap.appendChild(h('button', {
        class: 'btn small mode', type: 'button',
        title: dark ? 'Light mode' : 'Dark mode', 'aria-label': dark ? 'Light mode' : 'Dark mode',
        onclick: function () { Theme.setTheme(dark ? 'light' : 'dark'); paint() },
      }, dark ? '☀' : '☾'))
      var colors = { blue: '#2f6bff', purple: '#9b4dff', green: '#13a85b', orange: '#ff7a00', rose: '#ff2e7e' }
      Theme.accents.forEach(function (a) {
        wrap.appendChild(h('button', {
          class: 'swatch', type: 'button', title: a, 'aria-label': a + ' accent',
          'aria-pressed': Theme.accent === a ? 'true' : 'false',
          style: 'background:' + colors[a],
          onclick: function () { Theme.setAccent(a); paint() },
        }))
      })
    }
    paint()
    return wrap
  }

  function isActive(href, r) {
    return href.split('/')[1] === r.path[0]
  }

  function navLinks(r, onClick) {
    return NAV.map(function (l) {
      return h('a', {
        href: l.href, class: isActive(l.href, r) ? 'active' : null,
        'aria-current': isActive(l.href, r) ? 'page' : null, onclick: onClick,
      }, [icon(l.icon), l.label])
    })
  }

  var drawerOpen = false

  function renderHeader(r) {
    var header = document.getElementById('header')
    clear(header)
    header.appendChild(h('div', { class: 'inner' }, [
      h('a', { class: 'brand', href: '#/vault', 'aria-label': 'MVP home' }, [
        icon('safe', 'logo'),
        h('span', { class: 'words' }, [
          h('span', { class: 'wordmark' }, px('MVP')),
          M.version ? h('span', { class: 'ver' }, 'v' + M.version) : null,
        ]),
      ]),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, navLinks(r)),
      h('div', { class: 'header-tools' }, [
        themeSwitch(),
        h('a', { class: 'signout', href: '#/vault', title: 'Only shown when the OIDC gate is on' }, 'Sign out'),
        h('button', {
          class: 'btn icon menu-btn', type: 'button', 'aria-label': 'Menu',
          'aria-expanded': drawerOpen ? 'true' : 'false', 'aria-controls': 'drawer',
          onclick: function () { drawerOpen = !drawerOpen; renderDrawer(route()) },
        }, '☰'),
      ]),
    ]))
  }

  function renderDrawer(r) {
    var d = document.getElementById('drawer')
    clear(d)
    d.className = 'drawer' + (drawerOpen ? ' open' : '')
    var btn = document.querySelector('.menu-btn')
    if (btn) btn.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false')
    if (!drawerOpen) return
    var close = function () { drawerOpen = false; renderDrawer(route()) }
    d.appendChild(h('div', { class: 'backdrop', onclick: close }))
    d.appendChild(win('Go to…', { onClose: close, icon: 'star' }, [
      h('nav', { 'aria-label': 'Main' }, navLinks(r, close)),
    ]))
  }

  // ------------------------------------------------- taskbar + start menu

  var START = [
    { group: 'Screens' },
    { href: '#/vault', label: 'Vault', icon: 'vault' },
    { href: '#/queue', label: 'Queue', icon: 'queue' },
    { href: '#/tags', label: 'Tags', icon: 'tags' },
    { href: '#/settings/general', label: 'Settings › General', icon: 'settings' },
    { href: '#/settings/binaries', label: 'Settings › Binaries', icon: 'settings' },
    { href: '#/settings/cookies', label: 'Settings › Cookies', icon: 'settings' },
    { href: '#/settings/sharing', label: 'Settings › Sharing', icon: 'settings' },
    { href: '#/settings/api', label: 'Settings › API', icon: 'settings' },
    { href: '#/settings/discord', label: 'Settings › Discord', icon: 'settings' },
    { href: '#/settings/fluxer', label: 'Settings › Fluxer', icon: 'settings' },
    { group: 'Dialogs' },
    { href: '#/vault?modal=add', label: 'Add to vault', icon: 'star' },
    { href: '#/vault?modal=add&demo=drag', label: 'Add to vault — dragging over', icon: 'star' },
    { href: '#/vault?modal=add&demo=files', label: 'Add to vault — files selected', icon: 'star' },
    { href: '#/vault?modal=media&id=' + M.media[0].id, label: 'Media — video with poster', icon: 'film' },
    { href: '#/vault?modal=media&id=' + M.media[1].id, label: 'Media — image', icon: 'picture' },
    { href: '#/vault?modal=media&id=' + M.media[6].id, label: 'Media — video, no thumbnail', icon: 'film' },
    { group: 'States' },
    { href: '#/vault?state=empty', label: 'Vault — empty', icon: 'info' },
    { href: '#/vault?state=loading', label: 'Vault — loading', icon: 'queue' },
    { href: '#/vault?state=error', label: 'Vault — error', icon: 'error' },
    { href: '#/queue?state=empty', label: 'Queue — empty', icon: 'info' },
    { href: '#/queue?state=loading', label: 'Queue — loading', icon: 'queue' },
    { href: '#/queue?state=error', label: 'Queue — error', icon: 'error' },
    { href: '#/settings/general?msg=saved', label: 'Settings — saved', icon: 'info' },
    { href: '#/settings/general?msg=error', label: 'Settings — save error', icon: 'error' },
    { group: 'Public share page' },
    { href: 'share.html?token=k3Jd9xQ2mPz7', label: 'Share — video, download allowed', icon: 'globe' },
    { href: 'share.html?token=Hx2cVn6pEa0S', label: 'Share — image, download allowed', icon: 'globe' },
    { href: 'share.html?token=Wq8LrT1vYb4N', label: 'Share — no download', icon: 'globe' },
    { href: 'share.html?token=Al5bum7Tk9Zr', label: 'Share — album', icon: 'globe' },
    { sep: true },
    { href: '../index.html', label: 'All style prototypes', icon: 'folder' },
  ]

  var startOpen = false

  function setStart(open) {
    startOpen = open
    var menu = document.getElementById('start-menu')
    menu.hidden = !open
    var btn = document.querySelector('.start-btn')
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      btn.setAttribute('aria-pressed', open ? 'true' : 'false')
    }
    if (open) {
      var first = menu.querySelector('a')
      if (first) first.focus()
    }
  }

  function renderStartMenu() {
    var menu = document.getElementById('start-menu')
    clear(menu)
    menu.appendChild(h('div', { class: 'rail', 'aria-hidden': 'true' }, px('MemeVault 2000')))
    menu.appendChild(h('div', { class: 'items' }, START.map(function (s) {
      if (s.sep) return h('hr')
      if (s.group) return h('div', { class: 'group' }, s.group)
      return h('a', { href: s.href, onclick: function () { setStart(false) } }, [icon(s.icon), s.label])
    })))
  }

  function renderTaskbar(r) {
    var bar = document.getElementById('taskbar')
    clear(bar)
    var current = NAV.filter(function (l) { return isActive(l.href, r) })[0]
    bar.appendChild(h('button', {
      class: 'btn start-btn', type: 'button', 'aria-haspopup': 'true', 'aria-controls': 'start-menu',
      'aria-expanded': startOpen ? 'true' : 'false', 'aria-pressed': startOpen ? 'true' : 'false',
      title: 'Every screen in this prototype',
      onclick: function (e) { e.stopPropagation(); setStart(!startOpen) },
    }, [icon('star'), px('Start')]))
    if (current) {
      bar.appendChild(h('a', { class: 'btn task', href: current.href, 'aria-pressed': 'true' }, [icon(current.icon), h('span', null, current.label)]))
    }
    bar.appendChild(h('div', { class: 'tray' }, [
      h('span', { title: 'Active downloads' }, '⇩ ' + activeQueue().length),
      h('span', { id: 'clock' }),
    ]))
    tick()
  }

  function tick() {
    var c = document.getElementById('clock')
    if (!c) return
    var d = new Date()
    var hh = d.getHours(), mm = d.getMinutes()
    c.textContent = ((hh + 11) % 12 + 1) + ':' + (mm < 10 ? '0' : '') + mm + ' ' + (hh < 12 ? 'AM' : 'PM')
  }
  setInterval(tick, 15000)

  function activeQueue() {
    return S.queue.filter(function (q) { return q.status === 'pending' || q.status === 'downloading' })
  }

  document.addEventListener('click', function (e) {
    if (!startOpen) return
    var menu = document.getElementById('start-menu')
    if (!menu.contains(e.target)) setStart(false)
  })
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return
    if (startOpen) { setStart(false); return }
    if (drawerOpen) { drawerOpen = false; renderDrawer(route()) }
  })

  // ------------------------------------------------------------- render

  function render() {
    var r = route()
    drawerOpen = false
    renderHeader(r)
    renderDrawer(r)
    renderTaskbar(r)
    var main = document.getElementById('main')
    clear(main)
    main.appendChild(VIEWS[r.path[0]](r))
    window.scrollTo(0, 0)
  }

  window.addEventListener('hashchange', render)
  renderStartMenu()
  render()

  // Exposed for the later view sections of this file and for poking around in the console.
  window.Retro = { h: h, win: win, S: S, route: route, go: go, withParams: withParams }
})()
