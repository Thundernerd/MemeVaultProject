/*
 * DOM helpers shared by index.html (app.js) and share.html.
 * Throwaway prototype code (prototypes/retro/). Classic script: defines window.RetroDom.
 */
(function () {
  'use strict'

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

  /** 0:14, 10:12 or 1:02:05 */
  function fmtDuration(s) {
    if (s == null) return '0:00'
    var m = Math.floor(s / 60), sec = s % 60
    return (m >= 60 ? Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2) : m) + ':' + ('0' + sec).slice(-2)
  }

  /**
   * The media player box: a video shows its poster (or "NO SIGNAL" without a
   * thumbnail) over a fake transport bar; an image shows the picture.
   * src is MOCK.thumbnail(item).
   */
  function player(item, src) {
    if (item.type !== 'video') {
      return h('div', { class: 'player image' }, h('div', { class: 'screen' }, h('img', { src: src, alt: item.title || '' })))
    }
    return h('div', { class: 'player video' }, [
      h('div', { class: 'screen' }, src ? h('img', { src: src, alt: '' }) : h('span', { class: 'no-signal' }, 'NO SIGNAL')),
      h('div', { class: 'transport' }, [
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'Play' }, '▶'),
        h('div', { class: 'seek' }, h('div')),
        h('span', { class: 'time' }, '0:00 / ' + fmtDuration(item.duration)),
      ]),
    ])
  }

  window.RetroDom = { h: h, append: append, clear: clear, fmtDuration: fmtDuration, player: player }
})()
