/* Modals: AddUrlModal.vue ("Add to vault") and MediaModal.vue (media detail). */
(function () {
  'use strict'

  var B = window.BRUTAL
  var M = window.MOCK
  var h = B.h

  function frame(opts, body) {
    return h('div', { class: 'modal' },
      h('div', { class: 'modal-backdrop', onclick: B.closeModal }),
      h('div', { class: 'modal-box' + (opts.wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label }, body))
  }

  function svgUpload() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    s.setAttribute('viewBox', '0 0 24 24')
    s.setAttribute('width', '36'); s.setAttribute('height', '36')
    s.setAttribute('aria-hidden', 'true')
    s.innerHTML = '<path d="M12 18V5M5 11l7-7 7 7M3 21h18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/>'
    return s
  }

  // ------------------------------------------------------------ add to vault

  B.modals.add = function (route) {
    var p = route.params
    var files = p.files === '1' ? [
      { name: 'IMG_4021.png', state: 'done' },
      { name: 'cat-video-final-FINAL-v3-really-final.mp4', state: 'pending' },
      { name: 'screen-recording-2026-11-01.mov', state: 'error', error: 'File too large (max 2 GB)' },
    ] : []
    var busy = false
    var urlMsg = h('p', { class: 'label ok-text', role: 'status' })

    var drop = h('div', {
      class: 'dropzone' + (p.drag === '1' ? ' over' : ''), role: 'button', tabindex: '0',
      'aria-label': 'Drop files here or browse',
      onclick: function () { input.click() },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click() } },
      ondragover: function (e) { e.preventDefault(); drop.classList.add('over') },
      ondragleave: function () { drop.classList.remove('over') },
      ondrop: function (e) {
        e.preventDefault(); drop.classList.remove('over')
        addFiles(e.dataTransfer && e.dataTransfer.files)
      },
    },
      svgUpload(),
      h('p', { class: 'drop-title' }, 'Drop files here or ', h('u', { text: 'browse' })),
      h('p', { class: 'label muted', text: 'Videos and images' }))
    var input = h('input', { type: 'file', multiple: true, accept: 'video/*,image/*', hidden: true, onchange: function () { addFiles(input.files); input.value = '' } })
    var list = h('ul', { class: 'file-list' })
    var action = h('div')

    function addFiles(fl) {
      if (!fl) return
      Array.prototype.forEach.call(fl, function (f) {
        if (!files.some(function (x) { return x.name === f.name })) files.push({ name: f.name, state: 'pending' })
      })
      renderFiles()
    }

    function renderFiles() {
      B.clear(list)
      list.hidden = !files.length
      files.forEach(function (f) {
        list.appendChild(h('li', { class: 'file file-' + f.state },
          h('span', { class: 'file-icon', 'aria-label': f.state, text: f.state === 'done' ? '✓' : f.state === 'error' ? '✕' : '' }),
          h('span', { class: 'file-name truncate', text: f.name }),
          f.state === 'error' && f.error ? h('span', { class: 'file-msg truncate', text: f.error }) : null,
          f.state === 'pending' && !busy ? h('button', {
            class: 'file-remove', type: 'button', 'aria-label': 'Remove ' + f.name, text: '✕',
            onclick: function () { files.splice(files.indexOf(f), 1); renderFiles() },
          }) : null))
      })
      var pending = files.filter(function (f) { return f.state === 'pending' }).length
      var allDone = files.length > 0 && files.every(function (f) { return f.state === 'done' })
      B.clear(action)
      action.appendChild(allDone
        ? h('button', { class: 'btn btn-block', type: 'button', text: 'Done', onclick: B.closeModal })
        : h('button', {
          class: 'btn btn-primary btn-block', type: 'button', disabled: pending === 0 || busy,
          text: busy ? 'Uploading…' : pending > 0 ? 'Upload ' + pending + ' file' + (pending !== 1 ? 's' : '') : 'Upload',
          onclick: upload,
        }))
    }

    function upload() {
      busy = true
      renderFiles()
      setTimeout(function () {
        files.forEach(function (f) { if (f.state === 'pending') f.state = 'done' })
        busy = false
        renderFiles()
      }, 900)
    }

    renderFiles()

    return frame({ label: 'Add to vault' }, [
      h('div', { class: 'modal-head' },
        h('h2', { text: 'Add to vault' }),
        h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': 'Close', text: '✕', onclick: B.closeModal })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true }), 'Include in random'),
      h('form', {
        class: 'stack',
        onsubmit: function (e) {
          e.preventDefault()
          urlMsg.textContent = 'Queued (prototype: nothing was downloaded)'
          e.target.reset()
        },
      },
        h('input', { class: 'input', type: 'url', required: true, placeholder: 'https://...', 'aria-label': 'URL', 'data-autofocus': true }),
        h('div', { class: 'radios' },
          h('label', { class: 'check' }, h('input', { type: 'radio', name: 'dl', value: 'ytdlp', checked: true }), 'yt-dlp (video)'),
          h('label', { class: 'check' }, h('input', { type: 'radio', name: 'dl', value: 'gallery-dl' }), 'gallery-dl')),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'Queue download' }),
        urlMsg),
      h('div', { class: 'divider' }, h('span', { class: 'label', text: 'Or upload files' })),
      drop, input, list, action,
    ])
  }

  // ------------------------------------------------------------ media detail

  function randomToken() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz0123456789'
    var t = ''
    for (var i = 0; i < 12; i++) t += abc[Math.floor(Math.random() * abc.length)]
    return t
  }

  B.modals.media = function (route) {
    var item = M.media[Number(route.params.id)]
    if (!item || B.store.media.indexOf(item) < 0) {
      return frame({ label: 'Not found' }, [
        h('div', { class: 'modal-head' }, h('h2', { text: 'Not found' }),
          h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': 'Close', text: '✕', onclick: B.closeModal })),
        h('p', { class: 'muted', text: 'This item is not in the vault (it may have been deleted).' }),
      ])
    }
    var thumb = M.thumbnail(item)
    var tags = item.tags.map(function (t) { return t.name })
    var copied = null

    var player = h('div', { class: 'player' },
      item.type === 'video'
        ? (thumb
          ? h('video', { controls: true, preload: 'none', poster: thumb, 'aria-label': item.title || 'Video' })
          : h('div', { class: 'player-empty' }, h('span', { class: 'label', text: 'Video · no thumbnail' })))
        : h('img', { src: thumb, alt: item.title || '' }))

    var tagRow = h('div', { class: 'chips' })
    var tagMsg = h('span', { class: 'label ok-text', role: 'status' })
    function renderTags() {
      B.clear(tagRow)
      tags.forEach(function (t) { tagRow.appendChild(h('span', { class: 'chip chip-static', text: t })) })
      if (!tags.length) tagRow.appendChild(h('span', { class: 'label muted', text: 'No tags' }))
    }
    renderTags()

    var shareList = h('div', { class: 'shares' })
    function renderShares() {
      B.clear(shareList)
      var mine = B.store.shares.filter(function (s) { return s.media_id === item.id })
      if (!mine.length) shareList.appendChild(h('p', { class: 'label muted', text: 'No share links' }))
      mine.forEach(function (s) {
        var url = M.shareUrl(s.token)
        shareList.appendChild(h('div', { class: 'share' },
          h('a', { class: 'share-url truncate', href: 'share.html#' + s.token, target: '_blank', text: url }),
          h('button', {
            class: 'btn btn-sm', type: 'button', text: copied === s.token ? 'Copied' : 'Copy',
            onclick: function () {
              try { if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {}) } catch (e) { /* ignore */ }
              copied = s.token; renderShares()
              setTimeout(function () { if (copied === s.token) { copied = null; renderShares() } }, 1500)
            },
          }),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button', text: 'Revoke',
            onclick: function () { B.store.shares.splice(B.store.shares.indexOf(s), 1); renderShares() },
          })))
      })
    }
    renderShares()

    var tagInput = h('input', { class: 'input input-sm', placeholder: 'Add tag', 'aria-label': 'Add tag' })

    return frame({ label: item.title || 'Untitled', wide: true }, [
      player,
      h('div', { class: 'modal-body' },
        h('div', { class: 'modal-head' },
          h('div', { class: 'min0' },
            h('h2', { class: 'media-title', text: item.title || 'Untitled' }),
            h('p', { class: 'media-url truncate', title: item.url, text: item.url })),
          h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': 'Close', text: '✕', onclick: B.closeModal, 'data-autofocus': true })),
        h('section', { class: 'stack' },
          h('h3', { class: 'label', text: 'Tags' }),
          tagRow,
          h('form', {
            class: 'inline-form',
            onsubmit: function (e) {
              e.preventDefault()
              var v = tagInput.value.trim()
              if (v && tags.indexOf(v) < 0) tags.push(v)
              tagInput.value = ''
              tagMsg.textContent = ''
              renderTags()
            },
          }, tagInput, h('button', { class: 'btn btn-sm btn-primary', type: 'submit', text: 'Add' }),
            h('button', { class: 'btn btn-sm', type: 'button', text: 'Save tags', onclick: function () { tagMsg.textContent = 'Saved' } }),
            tagMsg)),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!item.include_in_random }), 'Include in random'),
        h('section', { class: 'stack' },
          h('div', { class: 'row-between' },
            h('h3', { class: 'label', text: 'Share links' }),
            h('button', {
              class: 'btn btn-sm btn-pop', type: 'button', text: 'Create',
              onclick: function () {
                B.store.shares.push({ token: randomToken(), media_id: item.id, allow_download: 1, expires_at: null, created_at: new Date().toISOString() })
                renderShares()
              },
            })),
          shareList),
        h('div', { class: 'modal-foot' },
          h('button', {
            class: 'btn btn-danger', type: 'button', text: 'Delete',
            onclick: function () {
              B.store.media.splice(B.store.media.indexOf(item), 1)
              B.closeModal()
              B.refresh()
            },
          }))),
    ])
  }
})()
