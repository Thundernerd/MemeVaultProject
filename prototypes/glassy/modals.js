/*
 * Glassy prototype: the Add to vault modal (AddUrlModal.vue) and the media
 * detail modal (MediaModal.vue). Opened by the ?add and ?media=<id> flags.
 */
(function () {
  'use strict'

  var A = window.GlassApp
  var M = window.MOCK
  var h = A.h

  function closeAll() { A.setParams({ add: null, drag: null, files: null, media: null }) }

  function modal(panelClass, label, children) {
    var panel = h('div', { class: 'modal-panel ' + panelClass, role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, children)
    var el = h('div', { class: 'modal' }, [h('div', { class: 'modal-backdrop', onclick: closeAll }), panel])
    requestAnimationFrame(function () {
      // Focus the dialog itself so Tab starts inside it without a ring on Close.
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    })
    return el
  }

  // ------------------------------------------------------------ add to vault

  // The demo list behind ?files: one file in each state the modal shows.
  var DEMO_FILES = [
    { name: 'IMG_4188.jpg', state: 'pending' },
    { name: 'screen-recording-2026-11-09.mp4', state: 'done' },
    { name: 'way-too-large-video-export-final-final.mov', state: 'error', error: 'File too large (max 2 GB)' },
  ]

  var add = { files: null, includeInRandom: true, downloader: 'ytdlp', url: '' }

  function addModal(r) {
    if (!r.params.has('add')) { add.files = null; return null }
    if (!add.files) add.files = r.params.has('files') ? DEMO_FILES.map(function (f) { return Object.assign({}, f) }) : []
    var forcedDrag = r.params.has('drag')

    var fileList = h('ul', { class: 'files', 'aria-label': 'Selected files' })
    var uploadBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button' })
    var fileInput = h('input', {
      type: 'file', multiple: true, accept: 'video/*,image/*', hidden: true,
      onchange: function (e) { addFiles(e.target.files); e.target.value = '' },
    })

    function addFiles(list) {
      ;[].forEach.call(list, function (f) {
        if (!add.files.some(function (x) { return x.name === f.name })) add.files.push({ name: f.name, state: 'pending' })
      })
      drawFiles()
    }

    function drawFiles() {
      fileList.innerHTML = ''
      fileList.hidden = !add.files.length
      add.files.forEach(function (f) {
        var mark = f.state === 'pending' ? h('span', { class: 'dot-pending', 'aria-label': 'Pending' })
          : f.state === 'done' ? h('span', { class: 'success', 'aria-label': 'Uploaded' }, A.icon(A.ICONS.check, 16))
            : h('span', { class: 'danger', 'aria-label': 'Failed' }, A.icon(A.ICONS.x, 16))
        fileList.appendChild(h('li', { class: f.state }, [
          mark,
          h('span', { class: 'name truncate', title: f.name }, f.name),
          f.state === 'error' && f.error ? h('span', { class: 'err truncate', title: f.error }, f.error) : null,
          f.state === 'pending' ? h('button', {
            class: 'icon-btn', type: 'button', 'aria-label': 'Remove', style: 'width:24px;height:24px',
            onclick: function () { add.files = add.files.filter(function (x) { return x !== f }); drawFiles() },
          }, A.icon(A.ICONS.x, 12)) : null,
        ]))
      })
      var pending = add.files.filter(function (f) { return f.state === 'pending' }).length
      var allDone = add.files.length > 0 && add.files.every(function (f) { return f.state === 'done' })
      uploadBtn.className = allDone ? 'btn btn-block' : 'btn btn-primary btn-block'
      uploadBtn.disabled = !allDone && pending === 0
      uploadBtn.textContent = allDone ? 'Done' : pending > 0 ? 'Upload ' + pending + ' file' + (pending !== 1 ? 's' : '') : 'Upload'
    }
    uploadBtn.addEventListener('click', function () {
      if (uploadBtn.textContent === 'Done') return closeAll()
      uploadBtn.disabled = true
      uploadBtn.textContent = 'Uploading…'
      setTimeout(function () {
        add.files.forEach(function (f) { if (f.state === 'pending') f.state = 'done' })
        drawFiles()
      }, 700)
    })
    drawFiles()

    var zone = h('div', {
      class: 'dropzone' + (forcedDrag ? ' drag-over' : ''), role: 'button', tabindex: '0',
      'aria-label': 'Drop files here or browse',
      onclick: function () { fileInput.click() },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click() } },
      ondragover: function (e) { e.preventDefault(); zone.classList.add('drag-over') },
      ondragleave: function () { if (!forcedDrag) zone.classList.remove('drag-over') },
      ondrop: function (e) { e.preventDefault(); if (!forcedDrag) zone.classList.remove('drag-over'); addFiles(e.dataTransfer.files) },
    }, [
      h('span', { class: 'icon' }, A.icon(A.ICONS.upload, 22)),
      h('p', { class: 'small' }, ['Drop files here or ', h('strong', { style: 'color:var(--text-primary)' }, 'browse')]),
      h('p', { class: 'xs muted' }, 'Videos and images'),
    ])

    var radio = function (value, label) {
      return h('label', { class: 'radio' }, [
        h('input', { type: 'radio', name: 'downloader', value: value, checked: add.downloader === value, onchange: function () { add.downloader = value } }),
        label,
      ])
    }

    return modal('modal-sm', 'Add to vault', [
      h('div', { class: 'modal-head' }, [
        h('h2', { class: 'modal-title' }, 'Add to vault'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeAll }, A.icon(A.ICONS.x, 16)),
      ]),
      h('label', { class: 'check' }, [
        h('input', { type: 'checkbox', checked: add.includeInRandom, onchange: function (e) { add.includeInRandom = e.target.checked } }),
        'Include in random',
      ]),
      h('form', {
        style: 'display:flex;flex-direction:column;gap:12px',
        onsubmit: function (e) {
          e.preventDefault()
          A.db.queue.unshift({
            id: 'queue-local-' + Date.now(), url: add.url, downloader: add.downloader, status: 'pending', progress: 0,
            error: null, created_at: new Date().toISOString(), completed_at: null, source: 'web', source_label: null,
            include_in_random: add.includeInRandom ? 1 : 0,
          })
          add.url = ''
          location.hash = '#/queue'
        },
      }, [
        h('label', null, [
          h('span', { class: 'sr-only' }, 'URL'),
          h('input', { class: 'field', type: 'url', required: true, placeholder: 'https://...', value: add.url, oninput: function (e) { add.url = e.target.value } }),
        ]),
        h('div', { class: 'radios', role: 'radiogroup', 'aria-label': 'Downloader' }, [radio('ytdlp', 'yt-dlp (video)'), radio('gallery-dl', 'gallery-dl')]),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Queue download'),
      ]),
      h('hr', { class: 'divider' }),
      h('p', { class: 'xs muted' }, 'Or upload files'),
      zone,
      fileInput,
      fileList,
      uploadBtn,
    ])
  }

  // ------------------------------------------------------------ media detail

  var COPIED_MS = 1500
  var copied = { token: null, timer: null }
  var mediaState = { id: null, tags: [], include: true, tagInput: '' }

  function findMedia(id) {
    var all = A.db.media.slice()
    A.db.albums.forEach(function (a) { all = all.concat(a.media) })
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]
    return null
  }

  function mediaModal(r) {
    var id = r.params.get('media')
    var item = id && findMedia(id)
    if (!item) return null
    if (mediaState.id !== id) {
      mediaState = { id: id, tags: item.tags.slice(), include: item.include_in_random === 1, tagInput: '' }
    }
    var thumb = M.thumbnail(item)

    var player = h('div', { class: 'player' },
      item.type === 'video'
        // No file to play offline: the poster stands in, like a paused video.
        ? h('video', { controls: true, preload: 'none', poster: thumb || null, 'aria-label': item.title || 'Video' })
        : h('img', { src: thumb, alt: item.title || '' }))

    var tagRow = h('div', { class: 'filters-row', style: 'gap:8px' })
    function drawTags() {
      tagRow.innerHTML = ''
      mediaState.tags.forEach(function (t) {
        tagRow.appendChild(h('span', { class: 'chip', title: t.name }, h('span', null, t.name)))
      })
      var input = h('input', { class: 'field', placeholder: 'Add tag', 'aria-label': 'Add tag', value: mediaState.tagInput, oninput: function (e) { mediaState.tagInput = e.target.value } })
      tagRow.appendChild(h('form', {
        class: 'tag-form',
        onsubmit: function (e) {
          e.preventDefault()
          var name = mediaState.tagInput.trim()
          if (!name) return
          if (!mediaState.tags.some(function (t) { return t.name === name })) mediaState.tags.push({ id: 'tag-local-' + name, name: name })
          mediaState.tagInput = ''
          drawTags()
          tagRow.querySelector('input').focus()
        },
      }, [input, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Add')]))
      tagRow.appendChild(h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function (e) {
          item.tags = mediaState.tags.slice()
          e.target.textContent = 'Saved'
          setTimeout(function () { e.target.textContent = 'Save tags' }, COPIED_MS)
        },
      }, 'Save tags'))
    }
    drawTags()

    var shareList = h('div', { style: 'display:flex;flex-direction:column;gap:6px' })
    function drawShares() {
      shareList.innerHTML = ''
      var links = A.db.shares.filter(function (s) { return s.media_id === item.id })
      if (!links.length) shareList.appendChild(h('p', { class: 'xs muted' }, 'No share links yet.'))
      links.forEach(function (s) {
        var url = M.shareUrl(s.token)
        shareList.appendChild(h('div', { class: 'share-row' }, [
          h('a', { class: 'truncate', href: 'share.html#' + s.token, target: '_blank', title: url }, url),
          h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', 'aria-live': 'polite',
            onclick: function () { copy(s.token) },
          }, copied.token === s.token ? 'Copied' : 'Copy'),
          h('button', {
            class: 'btn btn-ghost btn-sm btn-danger', type: 'button',
            onclick: function () { A.db.shares = A.db.shares.filter(function (x) { return x !== s }); drawShares() },
          }, 'Revoke'),
        ]))
      })
    }
    function copy(token) {
      try { navigator.clipboard.writeText(M.shareUrl(token)).catch(function () {}) } catch (e) { /* no clipboard on file:// */ }
      copied.token = token
      clearTimeout(copied.timer)
      copied.timer = setTimeout(function () { copied.token = null; drawShares() }, COPIED_MS)
      drawShares()
    }
    drawShares()

    return modal('modal-lg', item.title || 'Untitled', [
      player,
      h('div', { class: 'modal-body' }, [
        h('div', { class: 'modal-head', style: 'align-items:flex-start' }, [
          h('div', { style: 'min-width:0' }, [
            h('h2', null, item.title || 'Untitled'),
            h('p', { class: 'xs muted truncate', title: item.url }, item.url),
          ]),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeAll }, A.icon(A.ICONS.x, 16)),
        ]),
        tagRow,
        h('label', { class: 'check' }, [
          h('input', { type: 'checkbox', checked: mediaState.include, onchange: function (e) { mediaState.include = e.target.checked; item.include_in_random = e.target.checked ? 1 : 0 } }),
          'Include in random',
        ]),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
          h('div', { class: 'modal-head' }, [
            h('h3', { class: 'small', style: 'font-weight:600' }, 'Share links'),
            h('button', {
              class: 'btn btn-sm', type: 'button',
              onclick: function () {
                var token = Math.random().toString(36).slice(2, 14)
                A.db.shares.unshift({ token: token, media_id: item.id, allow_download: 1, expires_at: null, created_at: new Date().toISOString() })
                copy(token)
              },
            }, 'Create'),
          ]),
          shareList,
        ]),
        h('div', { class: 'modal-foot' }, h('button', {
          class: 'btn btn-ghost btn-danger', type: 'button',
          onclick: function () {
            A.db.media = A.db.media.filter(function (m) { return m !== item })
            closeAll()
            A.rerender()
          },
        }, 'Delete')),
      ]),
    ])
  }

  A.MODALS.push(addModal, mediaModal)
})()
