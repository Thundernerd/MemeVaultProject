/*
 * Theme and accent for the retro prototype, mirroring frontend/src/theme.ts:
 * data-theme="dark|light" and data-accent="blue|purple|green|orange|rose" on
 * <html>. Remembered per browser; storage may be unavailable (file://, private
 * windows), so every access is guarded and the defaults still render.
 *
 * Loaded in <head> so the page never flashes the wrong theme.
 */
(function () {
  'use strict'

  var ACCENTS = ['blue', 'purple', 'green', 'orange', 'rose']
  var root = document.documentElement

  function load(key, fallback, allowed) {
    try {
      var v = localStorage.getItem(key)
      return allowed.indexOf(v) >= 0 ? v : fallback
    } catch (e) {
      return fallback
    }
  }

  function store(key, value) {
    try { localStorage.setItem(key, value) } catch (e) { /* not persisted */ }
  }

  var theme = load('mvp-retro-theme', 'dark', ['dark', 'light'])
  var accent = load('mvp-retro-accent', 'blue', ACCENTS)

  function apply() {
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-accent', accent)
  }
  apply()

  window.RetroTheme = {
    accents: ACCENTS,
    get theme() { return theme },
    get accent() { return accent },
    setTheme: function (t) { theme = t; store('mvp-retro-theme', t); apply() },
    setAccent: function (a) { accent = a; store('mvp-retro-accent', a); apply() },
  }
})()
