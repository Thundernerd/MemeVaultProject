/*
 * Theme and accent for the glassy prototype. Load it in <head>, before the
 * stylesheet paints, so the page never flashes the wrong theme.
 *
 * Mirrors frontend/src/theme.ts: data-theme (dark | light) and data-accent
 * (blue | purple | green | orange | rose) on <html>, remembered per browser.
 * Storage can be blocked (private windows, file:// in some browsers), so every
 * access is wrapped and the defaults still render.
 */
(function () {
  'use strict'

  var THEMES = ['dark', 'light']
  var ACCENTS = ['blue', 'purple', 'green', 'orange', 'rose']
  var KEY_THEME = 'mvp-glassy-theme'
  var KEY_ACCENT = 'mvp-glassy-accent'

  function read(key, allowed, fallback) {
    try {
      var v = localStorage.getItem(key)
      return allowed.indexOf(v) >= 0 ? v : fallback
    } catch (e) {
      return fallback
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value) } catch (e) { /* storage blocked */ }
  }

  var state = {
    theme: read(KEY_THEME, THEMES, 'dark'),
    accent: read(KEY_ACCENT, ACCENTS, 'blue'),
  }
  var listeners = []

  function apply() {
    document.documentElement.setAttribute('data-theme', state.theme)
    document.documentElement.setAttribute('data-accent', state.accent)
    listeners.forEach(function (fn) { fn(state) })
  }

  window.GlassTheme = {
    ACCENTS: ACCENTS,
    get: function () { return { theme: state.theme, accent: state.accent } },
    setTheme: function (t) {
      if (THEMES.indexOf(t) < 0) return
      state.theme = t
      write(KEY_THEME, t)
      apply()
    },
    setAccent: function (a) {
      if (ACCENTS.indexOf(a) < 0) return
      state.accent = a
      write(KEY_ACCENT, a)
      apply()
    },
    toggleTheme: function () {
      this.setTheme(state.theme === 'dark' ? 'light' : 'dark')
    },
    onChange: function (fn) { listeners.push(fn) },

    /**
     * Fills `el` with the ThemeSwitcher controls (components/ThemeSwitcher.vue):
     * a dark/light toggle and one swatch per accent.
     */
    mountSwitcher: function (el) {
      var self = this
      el.classList.add('theme-switcher')
      el.innerHTML = ''
      var toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'theme-toggle'
      toggle.addEventListener('click', function () { self.toggleTheme() })
      el.appendChild(toggle)
      var swatches = ACCENTS.map(function (a) {
        var b = document.createElement('button')
        b.type = 'button'
        b.className = 'swatch'
        b.setAttribute('data-swatch', a)
        b.title = a
        b.setAttribute('aria-label', 'Accent: ' + a)
        b.addEventListener('click', function () { self.setAccent(a) })
        el.appendChild(b)
        return b
      })
      function sync(s) {
        var dark = s.theme === 'dark'
        toggle.textContent = dark ? '☀' : '☾'
        toggle.title = dark ? 'Light mode' : 'Dark mode'
        toggle.setAttribute('aria-label', toggle.title)
        swatches.forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.getAttribute('data-swatch') === s.accent))
        })
      }
      listeners.push(sync)
      sync(state)
    },
  }

  apply()
})()
