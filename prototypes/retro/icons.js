/*
 * 12x12 pixel-art icons, drawn as inline SVG from character grids.
 * Throwaway prototype code. Icons.render('vault') returns an <svg class="ico">.
 *
 * Legend: '.' clear, '#' outline, 'w' white, 's' silver, 'a' accent,
 * 'y' yellow, 'o' dark yellow, 'b' brown, 'r' red, 'g' green, 'c' cyan.
 */
(function () {
  'use strict'

  var COLORS = {
    '#': '#14121c', w: '#ffffff', s: '#c3cad8', a: 'var(--accent)', y: '#ffd24a',
    o: '#d99a1c', b: '#8a5a2b', r: '#e8233f', g: '#21c46b', c: '#29c7f0',
  }

  var ICONS = {
    safe: [
      '############', '#ssssssssss#', '#s########s#', '#s#aaaaaa#s#', '#s#a####a#s#', '#s#a#yy#a###',
      '#s#a#yy#a###', '#s#a####a#s#', '#s#aaaaaa#s#', '#s########s#', '#ssssssssss#', '############',
    ],
    vault: [
      '###########.', '#a#wwwww#a##', '#a#wwwww#aa#', '#a#wwwww#aa#', '#a#######aa#', '#aaaaaaaaaa#',
      '#aa######aa#', '#aa#ssss#aa#', '#aa#s##s#aa#', '#aa#ssss#aa#', '#aa#ssss#aa#', '############',
    ],
    queue: [
      'bbbbbbbbbbbb', '.#wwwwwwww#.', '.#wyyyyyyw#.', '..#wyyyyw#..', '...#wyyw#...', '....#yy#....',
      '....#ww#....', '...#wwyw#...', '..#wwyyww#..', '.#wyyyyyyw#.', '.#yyyyyyyy#.', 'bbbbbbbbbbbb',
    ],
    tags: [
      '......######', '.....#yyyyy#', '....#yyyyyy#', '...#yyyy##y#', '..#yyyyy##y#', '.#yyyyyyyyy#',
      '#yyyyyyyyy#.', '#yyyyyyyy#..', '.#yyyyyy#...', '..#yyyy#....', '...#yy#.....', '....##......',
    ],
    settings: [
      '############', '#wwwwwwwwww#', '#ww#wwww#ww#', '#waaawww#ww#', '#ww#wwwaaaw#', '#ww#wwww#ww#',
      '#ww#w#ww#ww#', '#ww#aaaw#ww#', '#ww#w#ww#ww#', '#wwwwwwwwww#', '#ssssssssss#', '############',
    ],
    folder: [
      '............', '.####.......', '#oooo#######', '#oooooooooo#', '############', '#yyyyyyyyyy#',
      '#yyyyyyyyyy#', '#yyyyyyyyyy#', '#yyyyyyyyyy#', '#yyyyyyyyyy#', '############', '............',
    ],
    warn: [
      '.....##.....', '....#yy#....', '....#yy#....', '...#yyyy#...', '...#y##y#...', '..#yy##yy#..',
      '..#yy##yy#..', '.#yyy##yyy#.', '.#yyyyyyyy#.', '#yyyy##yyyy#', '#yyyyyyyyyy#', '############',
    ],
    error: [
      '...######...', '..#rrrrrr#..', '.#rrrrrrrr#.', '#rrwrrrrwrr#', '#rrrwrrwrrr#', '#rrrrwwrrrr#',
      '#rrrrwwrrrr#', '#rrrwrrwrrr#', '#rrwrrrrwrr#', '.#rrrrrrrr#.', '..#rrrrrr#..', '...######...',
    ],
    info: [
      '...######...', '..#cccccc#..', '.#cccwwccc#.', '#ccccwwcccc#', '#cccccccccc#', '#cccwwwcccc#',
      '#ccccwwcccc#', '#ccccwwcccc#', '#ccccwwcccc#', '.#ccwwwwcc#.', '..#cccccc#..', '...######...',
    ],
    star: [
      '.....##.....', '.....##.....', '....#yy#....', '...#yyyy#...', '.##yyyyyy##.', '##yyyyyyyy##',
      '##yyyyyyyy##', '.##yyyyyy##.', '...#yyyy#...', '....#yy#....', '.....##.....', '.....##.....',
    ],
    page: [
      '.#######....', '.#wwwww##...', '.#wwwww#w#..', '.#wwwww####.', '.#wwwwwwww#.', '.#w#####ww#.',
      '.#wwwwwwww#.', '.#w######w#.', '.#wwwwwwww#.', '.#w####www#.', '.#wwwwwwww#.', '.##########.',
    ],
    film: [
      '############', '#w#aaaaaa#w#', '###aaaaaa###', '#w#aaaaaa#w#', '###aawaaa###', '#w#aawwaa#w#',
      '###aawwwa###', '#w#aawwaa#w#', '###aawaaa###', '#w#aaaaaa#w#', '###aaaaaa###', '############',
    ],
    picture: [
      '############', '#cccccccccc#', '#ccccccyycc#', '#ccccccyycc#', '#cccccccccc#', '#ccccgccccc#',
      '#cccgggcccc#', '#ccgggggcgc#', '#cgggggggg##', '#gggggggggg#', '#gggggggggg#', '############',
    ],
    globe: [
      '...######...', '..#ccgcccc#.', '.#ccgggcccc#', '#cccggccgcc#', '#ccccccgggc#', '#gcccccgggc#',
      '#ggcccccgcc#', '#gggccccccc#', '#ggccccgccc#', '.#cccccggc#.', '..#cccccc#..', '...######...',
    ],
  }

  var NS = 'http://www.w3.org/2000/svg'

  function render(name, extraClass) {
    var grid = ICONS[name] || ICONS.page
    var paths = {}
    grid.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x]
        if (ch === '.') continue
        paths[ch] = (paths[ch] || '') + 'M' + x + ' ' + y + 'h1v1h-1z'
      }
    })
    var svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 12 12')
    svg.setAttribute('class', 'ico' + (extraClass ? ' ' + extraClass : ''))
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('shape-rendering', 'crispEdges')
    Object.keys(paths).forEach(function (ch) {
      var p = document.createElementNS(NS, 'path')
      p.setAttribute('d', paths[ch])
      p.setAttribute('style', 'fill:' + COLORS[ch])
      svg.appendChild(p)
    })
    return svg
  }

  window.Icons = { render: render }
})()
