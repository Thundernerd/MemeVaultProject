/*
 * Prototype chrome, not part of the design: a floating "Screens" button that
 * lists every screen and state from prototypes/SCREENS.md, so a reviewer can
 * reach each one from index.html (and from share.html). Numbers match SCREENS.md.
 */
(function () {
  'use strict'

  var A = 'index.html'
  var S = 'share.html'
  var GROUPS = [
    ['1. Header and navigation', [
      ['Desktop header', A + '#/vault'],
      ['Mobile drawer (below 768px)', A + '#/vault?drawer=1'],
    ]],
    ['2. Vault grid', [
      ['Grid, active downloads, albums', A + '#/vault'],
      ['Filter panel with tags selected', A + '#/vault?filters=1&type=video&tags=reaction,cats'],
    ]],
    ['3. Add to vault modal', [
      ['Idle', A + '#/vault?modal=add'],
      ['Drag-over and file states', A + '#/vault?modal=add&files=1&drag=1'],
    ]],
    ['4. Media detail modal', [
      ['Video with poster + share links', A + '#/vault?modal=media&id=0'],
      ['Image', A + '#/vault?modal=media&id=3'],
      ['Video without thumbnail', A + '#/vault?modal=media&id=6'],
      ['Untitled, long URL', A + '#/vault?modal=media&id=2'],
    ]],
    ['5. Queue', [
      ['Every status and source', A + '#/queue'],
    ]],
    ['6. Tags', [
      ['Grouped by namespace', A + '#/tags'],
    ]],
    ['7. Settings', [
      ['General (env-locked path)', A + '#/settings/general'],
      ['General: error message', A + '#/settings/general?msg=error'],
      ['Binaries', A + '#/settings/binaries'],
      ['Cookies', A + '#/settings/cookies'],
      ['Sharing: saved message', A + '#/settings/sharing?msg=saved'],
      ['API: one-time key reveal', A + '#/settings/api?reveal=1'],
      ['Discord', A + '#/settings/discord'],
      ['Fluxer', A + '#/settings/fluxer'],
    ]],
    ['8. Public share page', [
      ['Video, download allowed', S + '#k3Jd9xQ2mPz7'],
      ['Video, no download', S + '#Wq8LrT1vYb4N'],
      ['Image', S + '#Hx2cVn6pEa0S'],
      ['Album', S + '#Al5bum7Tk9Zr'],
    ]],
    ['9. Empty, loading, error', [
      ['Vault empty', A + '#/vault?state=empty'],
      ['Vault loading', A + '#/vault?state=loading'],
      ['Vault error', A + '#/vault?state=error'],
      ['Queue empty', A + '#/queue?state=empty'],
      ['Queue loading', A + '#/queue?state=loading'],
      ['Queue error', A + '#/queue?state=error'],
    ]],
  ]

  function build() {
    var wrap = document.createElement('div')
    wrap.className = 'proto'
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-pop proto-toggle'
    btn.textContent = 'Screens'
    btn.setAttribute('aria-expanded', 'false')
    btn.setAttribute('aria-controls', 'proto-panel')

    var panel = document.createElement('nav')
    panel.className = 'proto-panel'
    panel.id = 'proto-panel'
    panel.hidden = true
    panel.setAttribute('aria-label', 'Prototype screens')

    var head = document.createElement('div')
    head.className = 'proto-head'
    head.innerHTML = '<span class="label">Prototype · every screen</span><a class="label" href="../index.html">All styles ↗</a>'
    panel.appendChild(head)

    // Theme controls here too, since the share page has no header switcher.
    var themeBtn = document.createElement('button')
    themeBtn.type = 'button'
    themeBtn.className = 'btn btn-sm proto-theme'
    function label() { themeBtn.textContent = 'Theme: ' + window.BRUTAL_THEME.get().theme + ' (toggle)' }
    themeBtn.addEventListener('click', function () { window.BRUTAL_THEME.toggleTheme() })
    window.BRUTAL_THEME.onChange(label)
    label()
    panel.appendChild(themeBtn)

    GROUPS.forEach(function (g) {
      var h = document.createElement('p')
      h.className = 'label proto-group'
      h.textContent = g[0]
      panel.appendChild(h)
      var ul = document.createElement('ul')
      g[1].forEach(function (item) {
        var li = document.createElement('li')
        var a = document.createElement('a')
        a.href = item[1]
        a.textContent = item[0]
        a.addEventListener('click', function () { setOpen(false) })
        li.appendChild(a)
        ul.appendChild(li)
      })
      panel.appendChild(ul)
    })

    function setOpen(open) {
      panel.hidden = !open
      btn.setAttribute('aria-expanded', String(open))
      btn.textContent = open ? 'Close' : 'Screens'
    }
    btn.addEventListener('click', function () { setOpen(panel.hidden) })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) setOpen(false)
    })

    wrap.appendChild(panel)
    wrap.appendChild(btn)
    document.body.appendChild(wrap)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build)
  else build()
})()
