/*
 * Theme + accent for the brutalist prototype, mirroring frontend/src/theme.ts:
 * data-theme (dark | light) and data-accent (blue | purple | green | orange | rose)
 * on <html>, remembered in localStorage under the app's own keys.
 *
 * Loaded in <head> so the saved theme applies before first paint.
 * Storage can throw (private windows, file:// in some browsers), so every
 * access is guarded and the page still works without it.
 */
(function () {
  'use strict'

  var THEMES = ['dark', 'light']
  var ACCENTS = ['blue', 'purple', 'green', 'orange', 'rose']

  function read(key, allowed, fallback) {
    try {
      var v = window.localStorage.getItem(key)
      return allowed.indexOf(v) >= 0 ? v : fallback
    } catch (e) {
      return fallback
    }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, value) } catch (e) { /* not persisted */ }
  }

  var state = {
    theme: read('mvp-theme', THEMES, 'dark'),
    accent: read('mvp-accent', ACCENTS, 'blue'),
  }
  var listeners = []

  function apply() {
    document.documentElement.setAttribute('data-theme', state.theme)
    document.documentElement.setAttribute('data-accent', state.accent)
    listeners.forEach(function (fn) { fn(state) })
  }
  apply()

  window.BRUTAL_THEME = {
    accents: ACCENTS,
    get: function () { return { theme: state.theme, accent: state.accent } },
    setTheme: function (t) { state.theme = t; write('mvp-theme', t); apply() },
    toggleTheme: function () { this.setTheme(state.theme === 'dark' ? 'light' : 'dark') },
    setAccent: function (a) { state.accent = a; write('mvp-accent', a); apply() },
    onChange: function (fn) { listeners.push(fn) },
  }
})()
