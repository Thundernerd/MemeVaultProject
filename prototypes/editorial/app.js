/*
 * Shared chrome for the Minimal editorial prototype: theme and accent,
 * header with mobile drawer, small DOM helpers, the progress line, the two
 * modals (Add to vault, media detail) and the reviewer state switcher.
 *
 * Throwaway exploration: the app never imports this file. Classic script
 * (no modules, no fetch) so pages work when opened from disk.
 *
 * Load order on every page:
 *   <script src="../shared/mock-data.js"></script>
 *   <script src="app.js"></script>     (in <head>: sets the theme before paint)
 */
(function () {
  'use strict'

  // ------------------------------------------------------- theme + accent

  var ACCENTS = [
    { id: 'blue', color: '#2b4fa3' },
    { id: 'purple', color: '#6d3fa0' },
    { id: 'green', color: '#2d6a4a' },
    { id: 'orange', color: '#c2411c' },
    { id: 'rose', color: '#b3264a' },
  ]
  var THEME_KEY = 'mvp-editorial-theme'
  var ACCENT_KEY = 'mvp-editorial-accent'

  function load(key) {
    try { return localStorage.getItem(key) } catch (e) { return null }
  }
  function store(key, value) {
    try { localStorage.setItem(key, value) } catch (e) { /* private mode: keep it in memory */ }
  }

  var prefersDark = false
  try { prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches } catch (e) {}
  var theme = load(THEME_KEY) || (prefersDark ? 'dark' : 'light')
  var accent = load(ACCENT_KEY) || 'orange'
  if (theme !== 'light' && theme !== 'dark') theme = 'light'
  if (!ACCENTS.some(function (a) { return a.id === accent })) accent = 'orange'

  var root = document.documentElement
  function applyTheme() {
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-accent', accent)
    document.querySelectorAll('[data-theme-mode]').forEach(function (b) {
      b.textContent = theme === 'dark' ? '☾ Dark' : '☀ Light'
      b.setAttribute('aria-label', 'Theme: ' + theme + '. Switch to ' + (theme === 'dark' ? 'light' : 'dark'))
    })
    document.querySelectorAll('[data-accent-id]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-accent-id') === accent))
    })
  }
  applyTheme()

  function setTheme(t) { theme = t; store(THEME_KEY, t); applyTheme() }
  function setAccent(a) { accent = a; store(ACCENT_KEY, a); applyTheme() }

  // ------------------------------------------------------------- helpers

  /** el('div', {class: 'x', onclick: fn}, child, 'text', [more]) */
  function el(tag, attrs) {
    var node = document.createElement(tag)
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k]
        if (v == null || v === false) return
        if (k === 'class') node.className = v
        else if (k === 'text') node.textContent = v
        else if (k === 'html') node.innerHTML = v
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v)
        else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { node.style.setProperty(s, v[s]) })
        else node.setAttribute(k, v === true ? '' : v)
      })
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i])
    return node
  }
  function append(node, child) {
    if (child == null || child === false) return
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c) }); return }
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child)
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node }

  function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function fmtDuration(sec) {
    if (sec == null) return null
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    var mm = h ? String(m).padStart(2, '0') : String(m)
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
  }
  function fmtBytes(n) {
    if (n == null) return '—'
    return n.toLocaleString('en-GB') + ' bytes'
  }

  /** Parse "#a&b=c" into { a: true, b: 'c' }. */
  function hashState() {
    var out = {}
    location.hash.replace(/^#/, '').split('&').forEach(function (part) {
      if (!part) return
      var i = part.indexOf('=')
      if (i < 0) out[decodeURIComponent(part)] = true
      else out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1))
    })
    return out
  }

  function findMedia(id) {
    var M = window.MOCK
    for (var i = 0; i < M.media.length; i++) if (M.media[i].id === id) return M.media[i]
    for (var a = 0; a < M.albums.length; a++) {
      for (var j = 0; j < M.albums[a].media.length; j++) if (M.albums[a].media[j].id === id) return M.albums[a].media[j]
    }
    return null
  }

  // ------------------------------------------------------ progress line

  /** Mirrors components/DownloadProgress.vue: Waiting / Starting… / n% / Processing…. */
  function progress(status, value) {
    var label, cls = 'progress', width = 0
    if (status === 'pending') { label = 'Waiting'; cls += ' is-waiting' }
    else if (value < 1) { label = 'Starting…'; cls += ' is-indeterminate' }
    else if (value >= 99) { label = 'Processing…'; cls += ' is-indeterminate' }
    else { label = Math.round(value) + '%'; width = value }
    return el('div', { class: cls, role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': width ? Math.round(width) : null },
      el('div', { class: 'progress-track' }, el('div', { class: 'progress-fill', style: { width: width + '%' } })),
      el('span', { class: 'progress-label' }, label))
  }

  /** Empty / error block: a small eyebrow over a serif line and a note. */
  function stateBlock(eyebrow, title, note, cls) {
    return el('div', { class: 'state' },
      el('p', { class: 'eyebrow' }, eyebrow),
      el('h2', { class: 'state-title ' + (cls || '') }, title),
      note ? el('p', { class: 'note' }, note) : null)
  }

  // -------------------------------------------------------------- header

  var NAV = [
    { id: 'vault', label: 'Vault', href: 'vault.html' },
    { id: 'queue', label: 'Queue', href: 'queue.html' },
    { id: 'tags', label: 'Tags', href: 'tags.html' },
    { id: 'settings', label: 'Settings', href: 'settings.html' },
  ]

  function themeControls() {
    return el('div', { class: 'theme' },
      el('button', { class: 'theme-mode', type: 'button', 'data-theme-mode': true,
        onclick: function () { setTheme(theme === 'dark' ? 'light' : 'dark') } }),
      el('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent colour' },
        ACCENTS.map(function (a) {
          return el('button', { class: 'swatch', type: 'button', 'data-accent-id': a.id, title: a.id,
            'aria-label': 'Accent ' + a.id, style: { '--sw': a.color }, onclick: function () { setAccent(a.id) } })
        })))
  }

  function navLinks(active) {
    return NAV.map(function (n) {
      return el('a', { href: n.href, 'aria-current': n.id === active ? 'page' : null }, n.label)
    })
  }

  /** Renders the header into <header id="site-header" data-active="vault">. */
  function renderHeader() {
    var host = document.getElementById('site-header')
    if (!host) return
    var active = host.getAttribute('data-active')
    host.className = 'site-header'
    var menuBtn = el('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Menu',
      'aria-expanded': 'false', 'aria-controls': 'drawer' }, '☰')
    host.appendChild(el('div', { class: 'wrap' },
      el('a', { class: 'brand', href: 'index.html', 'aria-label': 'MemeVault prototype contents' },
        el('span', { class: 'brand-mark' }, 'MVP', el('span', null, '.')),
        el('span', { class: 'brand-version' }, 'v' + window.MOCK.version)),
      el('nav', { class: 'nav', 'aria-label': 'Main' }, navLinks(active)),
      el('div', { class: 'header-end' }, themeControls(), el('a', { class: 'signout', href: '#' , onclick: function (e) { e.preventDefault() } }, 'Sign out')),
      menuBtn))

    var backdrop = el('div', { class: 'drawer-backdrop' })
    var drawer = el('div', { class: 'drawer', id: 'drawer' },
      el('nav', { 'aria-label': 'Main' }, navLinks(active)),
      el('div', { class: 'drawer-foot' }, themeControls(), el('a', { class: 'signout', href: '#', onclick: function (e) { e.preventDefault() } }, 'Sign out')))
    host.appendChild(backdrop)
    host.appendChild(drawer)

    function setOpen(open) {
      document.body.classList.toggle('drawer-open', open)
      menuBtn.setAttribute('aria-expanded', String(open))
      menuBtn.textContent = open ? '✕' : '☰'
    }
    menuBtn.addEventListener('click', function () { setOpen(!document.body.classList.contains('drawer-open')) })
    backdrop.addEventListener('click', function () { setOpen(false) })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false) })
    window.addEventListener('resize', function () { if (window.innerWidth >= 768) setOpen(false) })
    applyTheme()
  }

  // ---------------------------------------------- reviewer state switcher

  /**
   * protoBar([{ label: 'Vault', hash: '' }, …]): a dashed strip at the foot of
   * the page that flips it between states via the URL hash.
   */
  function protoBar(title, states) {
    var bar = el('div', { class: 'proto-bar', 'aria-label': 'Prototype states' }, el('strong', null, 'Prototype · ' + title))
    var links = states.map(function (s) {
      return el('a', { href: '#' + s.hash, 'data-hash': s.hash }, s.label)
    })
    append(bar, links)
    function mark() {
      var h = location.hash.replace(/^#/, '')
      links.forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('data-hash') === h)) })
    }
    window.addEventListener('hashchange', mark)
    mark()
    document.body.appendChild(bar)
  }

  // --------------------------------------------------------------- modals

  var openModal = null
  var lastFocus = null

  function showModal(node, onClose) {
    closeModal(true)
    lastFocus = document.activeElement
    document.body.appendChild(node)
    document.body.classList.add('is-locked')
    openModal = { node: node, onClose: onClose }
    var focusable = node.querySelector('[data-autofocus]') || node.querySelector('.modal-close')
    if (focusable) focusable.focus({ preventScroll: true })
  }
  function closeModal(silent) {
    if (!openModal) return
    var m = openModal
    openModal = null
    m.node.remove()
    document.body.classList.remove('is-locked')
    if (!silent && m.onClose) m.onClose()
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true })
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openModal) closeModal() })

  function modalShell(panelClass, label, children) {
    var panel = el('div', { class: 'modal-panel ' + panelClass, role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
      el('button', { class: 'icon-btn modal-close', type: 'button', 'aria-label': 'Close', onclick: function () { closeModal() } }, '✕'),
      children)
    return el('div', { class: 'modal' }, el('div', { class: 'modal-scrim', onclick: function () { closeModal() } }), panel)
  }

  var ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8l3.5 3.5L13 5"/></svg>'
  var ICON_CROSS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>'

  /**
   * Add to vault (components/AddUrlModal.vue). opts.dragOver starts the drop
   * zone in its drag-over state; clicking the zone toggles it for review.
   */
  function openAddModal(opts) {
    opts = opts || {}
    var files = [
      { name: 'reaction-gif-final-FINAL.mp4', state: 'pending' },
      { name: 'IMG_4021.png', state: 'done' },
      { name: 'screen-recording-2026-11-09-at-22.41.17.mov', state: 'error', error: 'Unsupported file type' },
      { name: 'cat.jpg', state: 'pending' },
    ]
    var list = el('ul', { class: 'files' })
    var uploadBtn = el('button', { class: 'btn', type: 'button' })
    var msg = el('p', { class: 'msg', 'aria-live': 'polite' })

    function renderFiles() {
      clear(list)
      files.forEach(function (f, i) {
        var icon = f.state === 'pending' ? el('span', { class: 'state-dot', 'aria-label': 'pending' })
          : el('span', { class: f.state === 'done' ? 'is-done' : '', html: f.state === 'done' ? ICON_CHECK : ICON_CROSS, 'aria-label': f.state })
        list.appendChild(el('li', { class: 'is-' + f.state }, icon,
          el('span', { class: 'file-name', title: f.name }, f.name),
          f.state === 'error' ? el('span', { class: 'file-err', title: f.error }, f.error) : null,
          f.state === 'pending' ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', style: { width: '24px', height: '24px', 'font-size': '0.75rem' },
            onclick: function () { files.splice(i, 1); renderFiles() } }, '✕') : null))
      })
      list.hidden = !files.length
      var pending = files.filter(function (f) { return f.state === 'pending' }).length
      if (files.length && !pending) {
        uploadBtn.textContent = 'Done'
        uploadBtn.disabled = false
        uploadBtn.onclick = function () { closeModal() }
      } else {
        uploadBtn.textContent = pending > 0 ? 'Upload ' + pending + ' file' + (pending !== 1 ? 's' : '') : 'Upload'
        uploadBtn.disabled = pending === 0
        uploadBtn.onclick = function () {
          uploadBtn.disabled = true
          uploadBtn.textContent = 'Uploading…'
          setTimeout(function () {
            files.forEach(function (f) { if (f.state === 'pending') f.state = 'done' })
            renderFiles()
          }, 700)
        }
      }
    }

    var zone = el('div', { class: 'dropzone' + (opts.dragOver ? ' is-over' : ''), role: 'button', tabindex: '0',
      'aria-label': 'Drop files here or browse' },
      el('span', { html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V6M6 12l6-6 6 6"/><path d="M3 20h18"/></svg>' }),
      el('p', null, 'Drop files here or ', el('span', { class: 'browse' }, 'browse')),
      el('p', { class: 'hint' }, 'Videos and images'))
    zone.addEventListener('click', function () { zone.classList.toggle('is-over') })
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zone.classList.toggle('is-over') } })
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-over') })
    zone.addEventListener('dragleave', function () { zone.classList.remove('is-over') })
    zone.addEventListener('drop', function (e) {
      e.preventDefault()
      zone.classList.remove('is-over')
      Array.prototype.forEach.call(e.dataTransfer.files || [], function (f) { files.push({ name: f.name, state: 'pending' }) })
      renderFiles()
    })

    var url = el('input', { class: 'input', type: 'url', required: true, placeholder: 'https://...', 'aria-label': 'URL', 'data-autofocus': true })
    var form = el('form', { class: 'add-section', onsubmit: function (e) {
      e.preventDefault()
      msg.className = 'msg msg-ok'
      msg.textContent = 'Queued ' + url.value
      url.value = ''
    } },
      url,
      el('div', { class: 'radios', role: 'radiogroup', 'aria-label': 'Downloader' },
        el('label', { class: 'check' }, el('input', { type: 'radio', name: 'downloader', value: 'ytdlp', checked: true }), 'yt-dlp (video)'),
        el('label', { class: 'check' }, el('input', { type: 'radio', name: 'downloader', value: 'gallery-dl' }), 'gallery-dl')),
      el('div', { class: 'form-actions' }, el('button', { class: 'btn', type: 'submit' }, 'Queue download'), msg))

    renderFiles()
    showModal(modalShell('add-panel', 'Add to vault', [
      el('h2', null, 'Add to vault'),
      el('div', { style: { 'padding-top': '16px' } }, el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: true }), 'Include in random')),
      form,
      el('div', { class: 'add-section' },
        el('p', { class: 'eyebrow' }, 'Or upload files'),
        zone, list,
        el('div', { class: 'form-actions' }, uploadBtn)),
    ]), opts.onClose)
  }

  /**
   * Media detail (components/MediaModal.vue). onDelete(item) runs after
   * "Delete" so the page can drop the card.
   */
  function openMediaModal(item, opts) {
    opts = opts || {}
    var M = window.MOCK
    var thumb = M.thumbnail(item)
    var player = item.type === 'video'
      ? el('video', { controls: true, preload: 'none', poster: thumb || null, 'aria-label': 'Video player', style: { '--ar': item.width + ' / ' + item.height } })
      : el('img', { src: thumb, alt: item.title || '' })

    // Tags: editable list, saved on "Save tags".
    var tags = item.tags.map(function (t) { return t.name })
    var chips = el('div', { class: 'chips' })
    var tagMsg = el('span', { class: 'msg', 'aria-live': 'polite' })
    function renderTags() {
      clear(chips)
      if (!tags.length) chips.appendChild(el('span', { class: 'empty-note' }, 'No tags yet'))
      tags.forEach(function (name, i) {
        chips.appendChild(el('span', { class: 'chip chip-static', title: name }, el('span', null, name),
          el('button', { class: 'x', type: 'button', 'aria-label': 'Remove tag ' + name, onclick: function () { tags.splice(i, 1); tagMsg.textContent = ''; renderTags() } }, '✕')))
      })
    }
    var tagInput = el('input', { class: 'input', placeholder: 'Add tag', 'aria-label': 'Add tag' })
    var tagForm = el('form', { class: 'inline-form', onsubmit: function (e) {
      e.preventDefault()
      var v = tagInput.value.trim()
      if (v && tags.indexOf(v) < 0) tags.push(v)
      tagInput.value = ''
      tagMsg.textContent = ''
      renderTags()
    } }, tagInput, el('button', { class: 'btn btn-ghost', type: 'submit' }, 'Add'))

    // Share links for this item.
    var shares = M.shares.filter(function (s) { return s.media_id === item.id }).slice()
    var shareList = el('div')
    var copied = null
    function renderShares() {
      clear(shareList)
      if (!shares.length) shareList.appendChild(el('p', { class: 'empty-note' }, 'No share links'))
      shares.forEach(function (s, i) {
        var href = M.shareUrl(s.token)
        var meta = (s.expires_at ? 'Expires ' + fmtDate(s.expires_at) : 'Never expires') + ' · ' + (s.allow_download ? 'download allowed' : 'view only')
        shareList.appendChild(el('div', { class: 'share-row' },
          el('a', { href: 'share.html#media=' + encodeURIComponent(item.id) + (s.allow_download ? '' : '&view-only'), title: href }, href, el('span', { class: 'share-meta' }, meta)),
          el('button', { class: 'link-btn' + (copied === s.token ? ' is-copied' : ''), type: 'button', onclick: function () {
            try {
              if (navigator.clipboard) navigator.clipboard.writeText(href).catch(function () {})
            } catch (e) {}
            copied = s.token
            renderShares()
            setTimeout(function () { if (copied === s.token) { copied = null; renderShares() } }, 1500)
          } }, copied === s.token ? 'Copied' : 'Copy'),
          el('button', { class: 'link-btn danger', type: 'button', onclick: function () { shares.splice(i, 1); renderShares() } }, 'Revoke')))
      })
    }

    var titleText = item.title || 'Untitled'
    renderTags()
    renderShares()
    showModal(modalShell('media-panel', titleText, [
      el('div', { class: 'player' }, player),
      el('div', { class: 'details' },
        el('div', { class: 'details-head' },
          el('h2', { class: item.title ? '' : 'is-untitled' }, titleText),
          el('a', { class: 'source', href: item.url.indexOf('local://') === 0 ? null : item.url, target: '_blank', rel: 'noreferrer' }, item.url)),
        el('div', { class: 'details-section' },
          el('p', { class: 'eyebrow' }, 'Tags'), chips, tagForm,
          el('div', { class: 'form-actions' }, el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () {
            tagMsg.className = 'msg msg-ok'; tagMsg.textContent = 'Saved'
          } }, 'Save tags'), tagMsg)),
        el('div', { class: 'details-section' },
          el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: item.include_in_random ? true : null }), 'Include in random')),
        el('div', { class: 'details-section' },
          el('div', { class: 'section-label', style: { padding: 0 } },
            el('h3', { class: 'eyebrow' }, 'Share links'),
            el('button', { class: 'link-btn', type: 'button', onclick: function () {
              shares.push({ token: Math.random().toString(36).slice(2, 14), media_id: item.id, allow_download: 1, expires_at: '2026-11-19T18:00:00.000Z' })
              renderShares()
            } }, 'Create')),
          shareList),
        el('div', { class: 'details-foot' }, el('button', { class: 'link-btn danger', type: 'button', onclick: function () {
          closeModal(true)
          if (opts.onDelete) opts.onDelete(item)
        } }, 'Delete'))),
    ]), opts.onClose)
  }

  // ---------------------------------------------------------------- boot

  window.ED = {
    el: el, append: append, clear: clear,
    fmtDate: fmtDate, fmtDuration: fmtDuration, fmtBytes: fmtBytes,
    hashState: hashState, findMedia: findMedia,
    progress: progress, protoBar: protoBar, stateBlock: stateBlock,
    openAddModal: openAddModal, openMediaModal: openMediaModal, closeModal: closeModal,
    setTheme: setTheme, setAccent: setAccent,
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.MOCK) {
      document.body.prepend(el('p', { class: 'msg msg-err', style: { padding: '16px' } }, 'shared/mock-data.js did not load.'))
      return
    }
    renderHeader()
    applyTheme()
  })
})()
