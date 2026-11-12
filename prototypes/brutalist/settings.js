/* Settings: views/settings/SettingsLayout.vue and each tab view. */
(function () {
  'use strict'

  var B = window.BRUTAL
  var M = window.MOCK
  var h = B.h

  var TABS = [
    ['general', 'General'], ['binaries', 'Binaries'], ['cookies', 'Cookies'], ['sharing', 'Sharing'],
    ['api', 'API'], ['discord', 'Discord'], ['fluxer', 'Fluxer'],
  ]
  var ERROR_TEXT = 'Save failed: 500 Internal Server Error'

  // One editable copy for the session, like the app's loaded settings.
  var S = Object.assign({}, M.settings)
  var binaries = JSON.parse(JSON.stringify(M.binaries))
  var cookies = JSON.parse(JSON.stringify(M.cookies))
  var keys = M.apiKeys.slice()

  function locked(key) { return (S._overridden_by_env || []).indexOf(key) >= 0 }
  function on(v) { return v === '1' || v === 'true' }

  function fmtDate(iso) {
    if (!iso) return 'never'
    return iso.slice(0, 10) + ' ' + iso.slice(11, 16)
  }
  function fmtBytes(n) { return n.toLocaleString('en-US') + ' bytes' }

  function text(key, label, opts) {
    opts = opts || {}
    var isLocked = locked(key)
    return h('label', { class: 'field' },
      h('span', { class: 'label' }, label, isLocked ? h('span', { class: 'env-badge', text: 'env' }) : null),
      h('input', {
        class: 'input', type: opts.type || 'text', value: S[key] || '', placeholder: opts.placeholder || null,
        disabled: isLocked, title: isLocked ? 'Set by an environment variable' : null,
        oninput: function (e) { S[key] = e.target.value },
      }))
  }
  function check(key, label, invert) {
    return h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: invert ? S[key] !== '0' && S[key] !== 'false' : on(S[key]),
        onchange: function (e) { S[key] = e.target.checked ? '1' : '0' },
      }), label)
  }

  /** A form with Save and the "Saved" / error line every tab shows. */
  function form(msg, kids, saveLabel) {
    var status = h('p', { class: 'save-msg label', role: 'status' })
    function show(kind) {
      status.className = 'save-msg label ' + (kind === 'error' ? 'save-error' : kind === 'saved' ? 'save-ok' : '')
      status.textContent = kind === 'error' ? ERROR_TEXT : kind === 'saved' ? 'Saved' : ''
    }
    show(msg)
    return h('form', {
      class: 'settings-form',
      onsubmit: function (e) { e.preventDefault(); show('saved') },
    }, kids, h('div', { class: 'save-row' }, h('button', { class: 'btn btn-primary', type: 'submit', text: saveLabel || 'Save' }), status))
  }

  var tabs = {
    general: function (msg) {
      return form(msg, [
        text('download_path', 'Download path'),
        text('ytdlp_extra_args', 'yt-dlp extra args'),
        text('gallerydl_extra_args', 'gallery-dl extra args'),
      ])
    },

    binaries: function (msg) {
      var cards = h('div', { class: 'cards' })
      function renderCards() {
        B.clear(cards)
        Object.keys(binaries).forEach(function (k) {
          var b = binaries[k]
          cards.appendChild(h('div', { class: 'panel bin' + (b.exists ? '' : ' bin-missing') },
            h('div', { class: 'min0' },
              h('h3', { text: b.name }),
              h('p', { class: 'mono-sm muted truncate', title: b.path, text: b.path }),
              h('p', { class: 'label ' + (b.exists ? 'ok-text' : 'danger-text'), text: b.exists ? (b.version || 'installed') : 'missing' })),
            h('button', {
              class: 'btn btn-sm', type: 'button', disabled: b.busy, text: b.busy ? '…' : 'Download / update',
              onclick: function () {
                b.busy = true; renderCards()
                setTimeout(function () { b.busy = false; b.exists = true; b.version = b.version || '2026.11.01'; renderCards() }, 900)
              },
            })))
        })
      }
      renderCards()
      return h('div', { class: 'stack-lg' },
        form(msg, [
          text('ytdlp_bin', 'yt-dlp path', { placeholder: 'auto-managed' }),
          text('gallerydl_bin', 'gallery-dl path', { placeholder: 'auto-managed' }),
          text('ffmpeg_bin', 'ffmpeg path', { placeholder: 'auto-managed' }),
        ], 'Save paths'),
        cards)
    },

    cookies: function (msg) {
      var wrap = h('div', { class: 'cards' })
      function render() {
        B.clear(wrap)
        if (msg === 'error') wrap.appendChild(h('p', { class: 'save-msg label save-error', role: 'status', text: 'Upload failed: 500 Internal Server Error' }))
        ;['ytdlp', 'gallerydl'].forEach(function (tool) {
          var c = cookies[tool]
          wrap.appendChild(h('div', { class: 'panel stack' + (c.exists ? '' : ' bin-missing') },
            h('div', { class: 'row-between' },
              h('h3', { text: tool + ' cookies' }),
              h('span', { class: 'pill label ' + (c.exists ? 'pill-ok' : 'pill-off'), text: c.exists ? 'present' : 'missing' })),
            h('p', { class: 'mono-sm muted', text: c.exists ? fmtBytes(c.size) + ' · ' + fmtDate(c.modifiedAt) : 'Not uploaded' }),
            h('div', { class: 'inline-form' },
              h('label', { class: 'btn btn-sm file-btn' }, 'Upload cookies.txt',
                h('input', {
                  type: 'file', accept: '.txt', class: 'visually-hidden',
                  onchange: function (e) {
                    var f = e.target.files[0]
                    if (!f) return
                    cookies[tool] = { exists: true, size: f.size, modifiedAt: new Date().toISOString() }
                    render()
                  },
                })),
              h('button', {
                class: 'btn btn-sm btn-danger', type: 'button', text: 'Delete', disabled: !c.exists,
                onclick: function () { cookies[tool] = { exists: false, size: null, modifiedAt: null }; render() },
              }))))
        })
      }
      render()
      return wrap
    },

    sharing: function (msg) {
      return form(msg, [
        text('share_default_expiry_days', 'Default expiry (days, empty = never)'),
        check('share_default_allow_download', 'Allow download by default', true),
        text('share_base_url', 'Share base URL (OG embeds)', { placeholder: 'https://memes.example.com' }),
        h('label', { class: 'field' },
          h('span', { class: 'label', text: 'Random mode' }),
          h('select', { class: 'select', onchange: function (e) { S.random_mode = e.target.value } },
            h('option', { value: 'flag', selected: S.random_mode === 'flag', text: 'Flagged items' }),
            h('option', { value: 'shared', selected: S.random_mode === 'shared', text: 'Items with share links' }))),
      ])
    },

    api: function (msg, route) {
      var reveal = h('div')
      var list = h('div', { class: 'cards' })
      var status = h('p', { class: 'save-msg label' + (msg === 'error' ? ' save-error' : ''), role: 'status', text: msg === 'error' ? 'Create failed: 500 Internal Server Error' : '' })
      function showKey(k) {
        B.clear(reveal)
        if (!k) return
        reveal.appendChild(h('div', { class: 'reveal' },
          h('p', { class: 'label', text: 'New key (copy now)' }),
          h('code', { class: 'reveal-key', text: k.key }),
          h('p', { class: 'mono-sm', text: 'It will not be shown again.' })))
      }
      function renderKeys() {
        B.clear(list)
        if (!keys.length) list.appendChild(B.stateBlock('empty', 'No API keys'))
        keys.forEach(function (k) {
          list.appendChild(h('div', { class: 'panel key' },
            h('div', { class: 'min0' },
              h('p', { class: 'key-name truncate', text: k.name }),
              h('p', { class: 'mono-sm muted' },
                h('span', { class: 'pill label ' + (k.permission === 'read' ? 'pill-off' : 'pill-ok'), text: k.permission }),
                ' created ' + fmtDate(k.created_at) + ' · last used ' + fmtDate(k.last_used_at))),
            h('button', {
              class: 'btn btn-sm btn-danger', type: 'button', text: 'Revoke',
              onclick: function () { keys.splice(keys.indexOf(k), 1); renderKeys() },
            })))
        })
      }
      if (route.params.reveal === '1') {
        if (keys.indexOf(M.newApiKey) < 0) keys.push(M.newApiKey)
        showKey(M.newApiKey)
      }
      renderKeys()
      var name = h('input', { class: 'input', required: true, placeholder: 'Key name (e.g. Extra tool)', 'aria-label': 'Key name' })
      var perm = h('select', { class: 'select', 'aria-label': 'Permission' },
        h('option', { value: 'read', text: 'read' }), h('option', { value: 'read_write', text: 'read_write' }))
      return h('div', { class: 'stack-lg' },
        h('p', { class: 'help' },
          'The key name is shown as a badge on queue items submitted via ', h('code', { text: 'POST /api/v1/submit' }),
          '. Pass ', h('code', { text: 'includeInRandom: true' }), ' to add the item to random selection when it finishes.'),
        h('form', {
          class: 'settings-form',
          onsubmit: function (e) {
            e.preventDefault()
            var k = Object.assign({}, M.newApiKey, { id: 'key-' + Date.now(), name: name.value, permission: perm.value })
            keys.push(k); showKey(k); renderKeys(); name.value = ''
          },
        }, name, perm, h('div', { class: 'save-row' }, h('button', { class: 'btn btn-primary', type: 'submit', text: 'Create key' }), status)),
        reveal,
        list)
    },

    discord: function (msg) {
      return form(msg, [
        check('discord_enabled', 'Enable Discord bot'),
        text('discord_bot_token', 'Bot token', { type: 'password' }),
        text('discord_client_id', 'Client ID'),
        text('discord_command_name', 'Command name', { placeholder: 'get' }),
        check('discord_post_as_user', 'Post downloads as the command sender'),
        h('p', { class: 'help' },
          'Downloads are posted to Discord only — they are not saved to the vault. They still appear in the Queue (marked Discord) so you can track progress and cancel. When posting as the sender, the bot needs ',
          h('strong', { text: 'Manage Webhooks' }),
          '; messages use that person\'s name and avatar but are still webhook messages (not real user messages).'),
      ])
    },

    fluxer: function (msg) {
      var cmd = (S.fluxer_command_prefix || '!') + (S.fluxer_command_name || 'get')
      return form(msg, [
        check('fluxer_enabled', 'Enable Fluxer bot'),
        text('fluxer_bot_token', 'Bot token', { type: 'password', placeholder: '<application_id>.<secret>' }),
        text('fluxer_instance_url', 'Instance URL', { placeholder: 'https://fluxer.app' }),
        h('div', { class: 'two-col' },
          text('fluxer_command_prefix', 'Command prefix', { placeholder: '!' }),
          text('fluxer_command_name', 'Command name', { placeholder: 'get' })),
        check('fluxer_post_as_user', 'Post downloads as the command sender'),
        check('fluxer_delete_command_message', 'Delete the sender\'s command message', true),
        h('p', { class: 'help' },
          'Fluxer bots do not have slash commands, so users invoke the bot with a message like ',
          h('code', { text: cmd + ' <url>' }), '. Add ', h('code', { text: 'image' }), ' for image sites (',
          h('code', { text: cmd + ' image <url>' }),
          ') and any trailing text as a caption. Downloads are posted to Fluxer only — they are not saved to the vault. They still appear in the Queue (marked Fluxer) so you can track progress and cancel. When posting as the sender, the bot needs ',
          h('strong', { text: 'Manage Webhooks' }),
          '; messages use that person\'s name and avatar but are still webhook messages (not real user messages). Deleting the sender\'s command message requires the bot to hold ',
          h('strong', { text: 'Manage Messages' }), '; it is skipped in DMs.'),
      ])
    },
  }

  B.pages.settings = function (route) {
    var tab = tabs[route.path[1]] ? route.path[1] : 'general'
    return h('div', { class: 'page' },
      h('h1', { text: 'Settings' }),
      h('nav', { class: 'tabs', 'aria-label': 'Settings' }, TABS.map(function (t) {
        return h('a', {
          class: 'tab' + (t[0] === tab ? ' active' : ''), href: '#/settings/' + t[0],
          'aria-current': t[0] === tab ? 'page' : null, text: t[1],
        })
      })),
      h('div', { class: 'tab-body' }, tabs[tab](route.params.msg, route)))
  }
})()
