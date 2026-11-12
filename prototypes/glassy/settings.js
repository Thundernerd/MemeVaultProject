/*
 * Glassy prototype: Settings (SettingsLayout.vue and the seven tab views).
 * Routes #/settings/<tab>. Flags: ?msg=saved|error shows the form message,
 * ?reveal shows the one-time API key.
 */
(function () {
  'use strict'

  var A = window.GlassApp
  var M = window.MOCK
  var h = A.h
  var S = Object.assign({}, M.settings)

  var TABS = [
    ['general', 'General'], ['binaries', 'Binaries'], ['cookies', 'Cookies'], ['sharing', 'Sharing'],
    ['api', 'API'], ['discord', 'Discord'], ['fluxer', 'Fluxer'],
  ]

  // The mock stores flags as '1'/'0'; the app's views also write 'true'/'false'.
  function on(key) { return S[key] === '1' || S[key] === 'true' }
  function locked(key) { return S._overridden_by_env.indexOf(key) >= 0 }

  function text(label, key, opts) {
    opts = opts || {}
    return h('label', { class: 'label' }, [
      h('span', null, [label, locked(key) ? h('span', { class: 'lock', title: 'Set by an environment variable' }, 'env') : null]),
      h('input', {
        class: 'field', type: opts.type || 'text', value: S[key] || '', placeholder: opts.placeholder || null,
        disabled: locked(key), oninput: function (e) { S[key] = e.target.value },
      }),
    ])
  }

  function check(label, key, invertDefault) {
    var checked = invertDefault ? S[key] !== '0' && S[key] !== 'false' : on(key)
    return h('label', { class: 'check' }, [
      h('input', { type: 'checkbox', checked: checked, onchange: function (e) { S[key] = e.target.checked ? '1' : '0' } }),
      label,
    ])
  }

  function message(msg) {
    if (msg === 'saved') return h('p', { class: 'msg success', role: 'status' }, [A.icon(A.ICONS.check, 14), 'Saved'])
    if (msg === 'error') return h('p', { class: 'msg danger', role: 'alert' }, [A.icon(A.ICONS.alert, 14), 'Failed to save: 500 Internal Server Error'])
    return null
  }

  /** A settings form with a Save button that shows "Saved" (or ?msg=error). */
  function form(r, children, saveLabel) {
    var msgHost = h('span', null, message(r.params.get('msg')))
    return h('form', {
      class: 'panel glass',
      onsubmit: function (e) {
        e.preventDefault()
        msgHost.innerHTML = ''
        msgHost.appendChild(message('saved'))
      },
    }, children.concat([
      h('div', { class: 'form-foot' }, [h('button', { class: 'btn btn-primary', type: 'submit' }, saveLabel || 'Save'), msgHost]),
    ]))
  }

  var TAB_VIEWS = {
    general: function (r) {
      return form(r, [
        text('Download path', 'download_path'),
        text('yt-dlp extra args', 'ytdlp_extra_args'),
        text('gallery-dl extra args', 'gallerydl_extra_args'),
      ])
    },

    binaries: function (r) {
      var rows = Object.keys(M.binaries).map(function (k) {
        var b = M.binaries[k]
        var btn = h('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: function () {
            btn.disabled = true
            btn.textContent = '…'
            setTimeout(function () { btn.disabled = false; btn.textContent = 'Download / update' }, 900)
          },
        }, 'Download / update')
        return h('div', { class: 'item-row' }, [
          h('div', { class: 'grow' }, [
            h('p', { class: 'name' }, b.name),
            h('p', { class: 'xs muted truncate', title: b.path }, b.path),
            h('p', { class: 'xs ' + (b.exists ? 'success' : 'danger') }, b.exists ? (b.version || 'installed') : 'missing'),
          ]),
          btn,
        ])
      })
      return h('div', { class: 'page', style: 'gap:16px' }, [
        form(r, [
          text('yt-dlp path', 'ytdlp_bin', { placeholder: 'auto-managed' }),
          text('gallery-dl path', 'gallerydl_bin', { placeholder: 'auto-managed' }),
          text('ffmpeg path', 'ffmpeg_bin', { placeholder: 'auto-managed' }),
        ], 'Save paths'),
        h('div', { class: 'panel glass', style: 'gap:10px' }, rows),
      ])
    },

    cookies: function (r) {
      var cards = ['ytdlp', 'gallerydl'].map(function (tool) {
        var c = M.cookies[tool]
        return h('div', { class: 'item-row', style: 'flex-direction:column;align-items:stretch;gap:10px' }, [
          h('div', null, [
            h('h3', { class: 'name' }, tool + ' cookies'),
            h('p', { class: 'xs muted' }, c.exists ? c.size.toLocaleString('en-US') + ' bytes · ' + A.fmtDate(c.modifiedAt) : 'Not uploaded'),
          ]),
          h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
            h('input', { class: 'file-input', type: 'file', accept: '.txt', 'aria-label': 'Upload ' + tool + ' cookies' }),
            h('button', { class: 'btn btn-sm btn-ghost btn-danger', type: 'button', disabled: !c.exists }, 'Delete'),
          ]),
        ])
      })
      return h('div', { class: 'panel glass', style: 'gap:10px' }, cards.concat([message(r.params.get('msg'))]))
    },

    sharing: function (r) {
      return form(r, [
        text('Default expiry (days, empty = never)', 'share_default_expiry_days'),
        check('Allow download by default', 'share_default_allow_download', true),
        text('Share base URL (OG embeds)', 'share_base_url', { placeholder: 'https://memes.example.com' }),
        h('label', { class: 'label' }, [
          h('span', null, 'Random mode'),
          h('select', { class: 'field', onchange: function (e) { S.random_mode = e.target.value } }, [
            h('option', { value: 'flag', selected: S.random_mode === 'flag' }, 'Flagged items'),
            h('option', { value: 'shared', selected: S.random_mode === 'shared' }, 'Items with share links'),
          ]),
        ]),
      ])
    },

    api: function (r) {
      var keys = h('div', { style: 'display:flex;flex-direction:column;gap:10px' })
      var list = M.apiKeys.slice()
      var revealHost = h('div')
      function drawKeys() {
        keys.innerHTML = ''
        list.forEach(function (k) {
          keys.appendChild(h('div', { class: 'item-row' }, [
            h('div', { class: 'grow' }, [
              h('p', { class: 'name truncate' }, k.name),
              h('p', { class: 'xs muted' }, k.permission + ' · created ' + A.fmtDate(k.created_at) + ' · last used ' + A.fmtDate(k.last_used_at)),
            ]),
            h('button', { class: 'btn btn-sm btn-ghost btn-danger', type: 'button', onclick: function () { list = list.filter(function (x) { return x !== k }); drawKeys() } }, 'Revoke'),
          ]))
        })
      }
      function reveal() {
        revealHost.innerHTML = ''
        revealHost.appendChild(h('div', { class: 'reveal', role: 'status' }, [
          h('span', null, 'New key (copy now):'),
          h('code', null, M.newApiKey.key),
        ]))
      }
      if (r.params.has('reveal')) { list.unshift(M.newApiKey); reveal() }
      drawKeys()

      return h('div', { class: 'panel glass' }, [
        h('p', { class: 'help' }, [
          'The key name is shown as a badge on queue items submitted via ', h('code', null, 'POST /api/v1/submit'),
          '. Pass ', h('code', null, 'includeInRandom: true'), ' to add the item to random selection when it finishes.',
        ]),
        h('form', {
          style: 'display:flex;flex-direction:column;gap:10px',
          onsubmit: function (e) {
            e.preventDefault()
            if (list.indexOf(M.newApiKey) < 0) list.unshift(M.newApiKey)
            drawKeys()
            reveal()
          },
        }, [
          h('label', null, [h('span', { class: 'sr-only' }, 'Key name'), h('input', { class: 'field', required: true, placeholder: 'Key name (e.g. Extra tool)' })]),
          h('label', null, [h('span', { class: 'sr-only' }, 'Permission'), h('select', { class: 'field' }, [h('option', { value: 'read' }, 'read'), h('option', { value: 'read_write' }, 'read_write')])]),
          h('div', { class: 'form-foot' }, [h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create key'), message(r.params.get('msg'))]),
        ]),
        revealHost,
        keys,
      ])
    },

    discord: function (r) {
      return form(r, [
        check('Enable Discord bot', 'discord_enabled'),
        text('Bot token', 'discord_bot_token', { type: 'password' }),
        text('Client ID', 'discord_client_id'),
        text('Command name', 'discord_command_name', { placeholder: 'get' }),
        check('Post downloads as the command sender', 'discord_post_as_user'),
        h('p', { class: 'help' }, [
          'Downloads are posted to Discord only — they are not saved to the vault. ',
          'They still appear in the Queue (marked Discord) so you can track progress and cancel. ',
          'When posting as the sender, the bot needs ', h('strong', null, 'Manage Webhooks'),
          "; messages use that person's name and avatar but are still webhook messages (not real user messages).",
        ]),
      ])
    },

    fluxer: function (r) {
      var cmd = (S.fluxer_command_prefix || '!') + (S.fluxer_command_name || 'get')
      return form(r, [
        check('Enable Fluxer bot', 'fluxer_enabled'),
        text('Bot token', 'fluxer_bot_token', { type: 'password', placeholder: '<application_id>.<secret>' }),
        text('Instance URL', 'fluxer_instance_url', { placeholder: 'https://fluxer.app' }),
        h('div', { class: 'row-2' }, [
          text('Command prefix', 'fluxer_command_prefix', { placeholder: '!' }),
          text('Command name', 'fluxer_command_name', { placeholder: 'get' }),
        ]),
        check('Post downloads as the command sender', 'fluxer_post_as_user'),
        check("Delete the sender's command message", 'fluxer_delete_command_message', true),
        h('p', { class: 'help' }, [
          'Fluxer bots do not have slash commands, so users invoke the bot with a message like ',
          h('code', null, cmd + ' <url>'), '. Add ', h('code', null, 'image'), ' for image sites (',
          h('code', null, cmd + ' image <url>'), ') and any trailing text as a caption. ',
          'Downloads are posted to Fluxer only — they are not saved to the vault. They still appear in ',
          'the Queue (marked Fluxer) so you can track progress and cancel. When posting as the sender, ',
          'the bot needs ', h('strong', null, 'Manage Webhooks'), "; messages use that person's name and avatar ",
          'but are still webhook messages (not real user messages). Deleting the sender\'s command ',
          'message requires the bot to hold ', h('strong', null, 'Manage Messages'), '; it is skipped in DMs.',
        ]),
      ])
    },
  }

  A.VIEWS.settings = function (r) {
    var tab = TAB_VIEWS[r.path[1]] ? r.path[1] : 'general'
    var tabs = h('nav', { class: 'tabs glass', 'aria-label': 'Settings' }, TABS.map(function (t) {
      return h('a', { href: '#/settings/' + t[0], 'aria-current': t[0] === tab ? 'page' : null }, t[1])
    }))
    var page = h('div', { class: 'page' }, [h('h1', { class: 'page-title' }, 'Settings'), tabs, TAB_VIEWS[tab](r)])
    // Keep the active tab in view when the bar scrolls sideways on a phone.
    requestAnimationFrame(function () {
      var cur = tabs.querySelector('[aria-current]')
      if (cur) tabs.scrollLeft = cur.offsetLeft - 16
    })
    return page
  }
})()
