/*
 * Mock data for the visual style prototypes.
 *
 * Throwaway exploration: the app never imports this file.
 *
 * Load it with a classic script tag (not type="module") so it also works
 * when a page is opened straight from disk (file://):
 *
 *   <script src="../shared/mock-data.js"></script>
 *
 * It defines window.MOCK. The collections mirror the shapes in
 * frontend/src/api.ts (MediaItem, Album, QueueItem, TagWithCount, ShareLink)
 * plus the extra shapes the Settings tabs read (settings, binaries, cookies,
 * apiKeys). Everything is static and offline: thumbnails are inline SVG
 * data URIs, never network images.
 */
(function () {
  'use strict'

  // ---------------------------------------------------------------- helpers

  var BASE_TIME = Date.parse('2026-11-10T18:00:00Z')

  function isoMinutesAgo(min) {
    return new Date(BASE_TIME - min * 60 * 1000).toISOString()
  }

  function uuid(prefix, n) {
    var hex = ('00000000' + (n * 2654435761 >>> 0).toString(16)).slice(-8)
    return prefix + '-' + hex + '-4000-8000-' + ('000000000000' + n).slice(-12)
  }

  // Deterministic hue per id so thumbnails look the same on every load.
  function hueOf(str) {
    // FNV-1a: ids differ only in their last digits, so a plain sum clusters.
    var h = 2166136261
    for (var i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0
    return h % 360
  }

  /**
   * Placeholder thumbnail for a MediaItem: an inline SVG gradient at the
   * item's own aspect ratio, as a data: URI. Follows the app's rule in
   * MediaCard.vue: no thumbnail for a video without thumbnail_path.
   * Returns null in that case so prototypes can style the fallback.
   */
  function thumbnail(item) {
    if (!item) return null
    if (!item.thumbnail_path && item.type !== 'image') return null
    var w = item.width || 640
    var h = item.height || 640
    var hue = hueOf(item.id)
    var hue2 = (hue + 50) % 360
    var r = Math.round(Math.min(w, h) / 6)
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="hsl(' + hue + ',70%,55%)"/>' +
      '<stop offset="1" stop-color="hsl(' + hue2 + ',65%,25%)"/>' +
      '</linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      '<circle cx="' + Math.round(w * 0.3) + '" cy="' + Math.round(h * 0.35) + '" r="' + r +
      '" fill="hsla(' + hue2 + ',90%,85%,0.35)"/>' +
      '<path d="M0 ' + h + ' L' + Math.round(w * 0.45) + ' ' + Math.round(h * 0.55) +
      ' L' + Math.round(w * 0.7) + ' ' + Math.round(h * 0.75) + ' L' + w + ' ' +
      Math.round(h * 0.45) + ' L' + w + ' ' + h + ' Z" fill="rgba(0,0,0,0.25)"/>' +
      (item.type === 'video'
        ? '<polygon points="' + (w / 2 - r / 2) + ',' + (h / 2 - r / 1.6) + ' ' +
          (w / 2 - r / 2) + ',' + (h / 2 + r / 1.6) + ' ' + (w / 2 + r / 1.4) + ',' + h / 2 +
          '" fill="rgba(255,255,255,0.8)"/>'
        : '') +
      '</svg>'
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }

  // ------------------------------------------------------------------- tags

  // Names use the app's "namespace:value" convention (TagsView groups by the
  // part before ":"; tags without one fall under "other").
  var TAG_DEFS = [
    'platform:youtube',
    'platform:twitter',
    'platform:reddit',
    'platform:tiktok',
    'platform:upload',
    'uploader:catsofinstagram',
    'uploader:nasa',
    'uploader:loremaster',
    'reaction',
    'cats',
    'dogs',
    'gaming',
    'wholesome',
    'cursed',
    'a-very-long-tag-name-that-should-truncate-somewhere',
    'orphaned', // never used: what "Purge unused" removes
  ]

  // usage_count is filled in from the media below, so it always matches.
  var tags = TAG_DEFS.map(function (name, i) {
    return {
      id: uuid('tag', i + 1),
      name: name,
      created_at: isoMinutesAgo(60 * 24 * 30 - i * 90),
      usage_count: 0,
    }
  })

  function tagRef(name) {
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].name === name) {
        return { id: tags[i].id, name: tags[i].name, created_at: tags[i].created_at }
      }
    }
    throw new Error('mock-data: unknown tag ' + name)
  }

  // ------------------------------------------------------------------ media

  // [type, title|null, url, uploader|null, w, h, duration|null, hasThumb, tagNames]
  // hasThumb only matters for videos: the backend always gives images a
  // thumbnail_path (the image file itself). Uploads use url "local://<file>".
  // Tags are hand-picked to cover 0-5 per item; the real autotagger also adds
  // type:, date: and format: tags, left out here to keep the 0-5 edge cases.
  var MEDIA_DEFS = [
    ['video', 'Cat knocks glass off table, maintains eye contact', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'catsofinstagram', 1920, 1080, 14, true, ['platform:youtube', 'cats', 'reaction', 'uploader:catsofinstagram']],
    ['image', 'Distracted boyfriend but it is three raccoons', 'https://twitter.com/memes/status/1790000000000000001', 'memes', 1200, 800, null, true, ['platform:twitter', 'reaction']],
    ['video', null, 'https://www.tiktok.com/@someone/video/7300000000000000001', null, 1080, 1920, 22, true, ['platform:tiktok']],
    ['image', 'Dog', 'https://i.redd.it/abc123def456.jpg', 'u/goodboy', 800, 800, null, true, ['platform:reddit', 'dogs', 'wholesome']],
    ['video', 'This is an extremely long title that keeps going well past where any reasonable card would ever want to truncate it, just to make sure every style handles overflow gracefully (part 2 of 7)', 'https://www.youtube.com/watch?v=longtitle0001', 'Some Channel With A Long Name', 1280, 720, 3725, true, ['platform:youtube', 'gaming', 'cursed', 'reaction', 'a-very-long-tag-name-that-should-truncate-somewhere']],
    ['image', null, 'local://IMG_4021.png', null, 1170, 2532, null, true, ['platform:upload']],
    ['video', 'Speedrun any% world record (no commentary)', 'https://www.youtube.com/watch?v=speedrun0002', 'speedy', 1920, 1080, 612, false, ['platform:youtube', 'gaming']],
    ['image', 'Pillar of Creation, but make it a meme', 'https://twitter.com/NASA/status/1790000000000000002', 'NASA', 2048, 1365, null, true, ['platform:twitter', 'uploader:nasa']],
    ['video', 'Dog sees snow for the first time', 'https://www.reddit.com/r/aww/comments/xyz789/', 'u/snowpup', 720, 720, 31, true, ['platform:reddit', 'dogs', 'wholesome']],
    ['image', 'When the build passes on the first try', 'https://twitter.com/devhumor/status/1790000000000000003', 'devhumor', 1000, 1000, null, true, ['platform:twitter', 'reaction']],
    ['video', null, 'https://www.youtube.com/shorts/short0000003', null, 1080, 1920, 9, true, ['platform:youtube']],
    ['image', 'cat.jpg', 'local://cat.jpg', null, 640, 480, null, true, ['platform:upload', 'cats']],
    ['video', 'Guy explains the entire lore in 4 minutes', 'https://www.youtube.com/watch?v=lore00000004', 'LoreMaster', 1920, 800, 241, true, ['platform:youtube', 'gaming', 'uploader:loremaster']],
    ['image', 'Panorama of the office after the deploy', 'https://i.redd.it/panorama00005.jpg', 'u/sre_life', 3000, 900, null, true, ['platform:reddit', 'cursed']],
    ['video', 'Cats being liquid compilation', 'https://twitter.com/catsofinstagram/status/1790000000000000004', 'catsofinstagram', 1280, 720, 95, true, ['platform:twitter', 'cats', 'uploader:catsofinstagram']],
    ['image', null, 'https://twitter.com/anon/status/1790000000000000005', null, 600, 900, null, true, []],
    ['video', 'Reaction: surprised pikachu but live action', 'https://www.tiktok.com/@reacts/video/7300000000000000002', 'reacts', 1080, 1350, 6, true, ['platform:tiktok', 'reaction']],
    ['image', 'Wholesome dog meme #47', 'https://i.redd.it/wholesome047.jpg', 'u/goodboy', 900, 1200, null, true, ['wholesome', 'dogs']],
    ['video', 'Untitled stream clip', 'https://clips.twitch.tv/ClipSlug0006', 'streamer_x', 1920, 1080, 44, false, ['gaming']],
    ['image', 'Cat in a box, box in a cat', 'https://twitter.com/catsofinstagram/status/1790000000000000006', 'catsofinstagram', 1080, 1080, null, true, ['platform:twitter', 'cats', 'uploader:catsofinstagram', 'cursed', 'wholesome']],
    ['video', 'Tiny frog yells', 'https://www.tiktok.com/@frogs/video/7300000000000000003', 'frogs', 1080, 1920, 3, true, ['platform:tiktok', 'reaction']],
    ['image', null, 'local://screenshot-2026-11-01.png', null, 2560, 1440, null, true, ['platform:upload']],
    ['video', 'Patch notes read by a dramatic narrator', 'https://www.youtube.com/watch?v=patchnotes07', 'Dramatic Reads', 1920, 1080, 488, true, ['platform:youtube', 'gaming']],
    ['image', 'Vertical comic, scroll for punchline', 'https://i.redd.it/verticalcomic8.png', 'u/comics', 800, 3200, null, true, ['platform:reddit']],
  ]

  function makeMedia(def, n, minutesAgo, album) {
    var type = def[0]
    var title = def[1]
    var url = def[2]
    var uploader = def[3]
    var width = def[4]
    var height = def[5]
    var duration = def[6]
    var hasThumb = def[7]
    var tagNames = def[8]

    var id = uuid('media', n)
    var isVideo = type === 'video'
    var isUpload = url.indexOf('local://') === 0
    var ext = isVideo ? 'mp4' : (url.slice(-4) === '.png' ? 'png' : 'jpg')
    var filePath = '/data/media/' + id + '.' + ext
    return {
      id: id,
      // Album media share the album's queue item; uploads have none. Single
      // downloads are linked to their queue row below, by URL.
      queue_item_id: album ? album.queue_item_id : null,
      url: url,
      type: type,
      title: title,
      // yt-dlp keeps the video description; gallery-dl and uploads have none.
      description: isVideo && !isUpload && title ? 'Original description for: ' + title : null,
      uploader: uploader,
      duration: duration,
      thumbnail_path: isVideo
        ? (hasThumb ? '/data/media/' + id + '_thumbnail.jpg' : null)
        : filePath,
      file_path: filePath,
      file_size: isVideo ? 1048576 * (2 + (n * 7) % 90) : 1024 * (80 + (n * 37) % 900),
      format: ext,
      width: width,
      height: height,
      created_at: isoMinutesAgo(minutesAgo),
      raw_metadata: null,
      album_id: album ? album.id : null,
      include_in_random: n % 5 === 0 ? 0 : 1,
      tags: tagNames.map(tagRef),
    }
  }

  // Newest first, like the vault.
  var media = MEDIA_DEFS.map(function (def, i) {
    return makeMedia(def, i + 1, 20 + i * 173)
  })

  // ----------------------------------------------------------------- albums

  // [title|null, url, uploader|null, minutesAgo, [media defs]]
  var ALBUM_DEFS = [
    ['Best of r/catsstandingup', 'https://www.reddit.com/gallery/catsalbum01', 'u/catlady', 300, [
      ['image', 'Standing cat 1', 'https://i.redd.it/stand01.jpg', 'u/catlady', 900, 1200, null, true, ['cats', 'platform:reddit']],
      ['image', 'Standing cat 2', 'https://i.redd.it/stand02.jpg', 'u/catlady', 1000, 1000, null, true, ['cats']],
      ['image', null, 'https://i.redd.it/stand03.jpg', 'u/catlady', 1200, 900, null, true, []],
      ['image', 'Standing cat 4 (judgemental)', 'https://i.redd.it/stand04.jpg', 'u/catlady', 800, 1000, null, true, ['cats', 'reaction']],
      ['image', null, 'https://i.redd.it/stand05.jpg', 'u/catlady', 1080, 1080, null, true, []],
    ]],
    [null, 'https://twitter.com/someone/status/1790000000000000010', 'someone', 2200, [
      ['image', null, 'https://pbs.twimg.com/media/aaa1.jpg', 'someone', 1200, 675, null, true, ['platform:twitter']],
      ['video', null, 'https://video.twimg.com/ext_tw_video/bbb2.mp4', 'someone', 1280, 720, 12, true, ['platform:twitter']],
    ]],
    ['Space wallpapers, a collection of very large images for the desktop background rotation', 'https://www.flickr.com/photos/nasa/albums/space03', 'NASA', 5000, [
      ['image', 'Nebula', 'https://live.staticflickr.com/n1.jpg', 'NASA', 3840, 2160, null, true, ['uploader:nasa']],
      ['image', 'Galaxy', 'https://live.staticflickr.com/n2.jpg', 'NASA', 3840, 2160, null, true, ['uploader:nasa']],
      ['image', 'Moon close-up', 'https://live.staticflickr.com/n3.jpg', 'NASA', 2160, 2160, null, true, ['uploader:nasa']],
      ['video', 'Launch', 'https://images.nasa.gov/launch.mp4', 'NASA', 1920, 1080, 180, true, ['uploader:nasa']],
      ['image', 'Earthrise', 'https://live.staticflickr.com/n5.jpg', 'NASA', 3000, 2000, null, true, ['uploader:nasa']],
      ['image', null, 'https://live.staticflickr.com/n6.jpg', 'NASA', 1080, 1920, null, true, []],
      ['image', 'Saturn', 'https://live.staticflickr.com/n7.jpg', 'NASA', 2400, 2400, null, true, ['uploader:nasa']],
      ['image', 'Mars', 'https://live.staticflickr.com/n8.jpg', 'NASA', 3840, 2160, null, true, ['uploader:nasa']],
    ]],
  ]

  var albums = ALBUM_DEFS.map(function (def, i) {
    var album = {
      id: uuid('album', i + 1),
      queue_item_id: uuid('queue', 2000 + i),
      url: def[1],
      title: def[0],
      uploader: def[2],
      created_at: isoMinutesAgo(def[3]),
      media: [],
    }
    album.media = def[4].map(function (md, j) {
      return makeMedia(md, 100 + i * 10 + j, def[3], album)
    })
    return album
  })

  // ------------------------------------------------------------------ queue

  // Statuses the backend writes: pending, downloading, completed, failed,
  // cancelled. Sources: web, api, discord, fluxer. Progress is 0-100;
  // DownloadProgress.vue shows "Starting…" below 1 and "Processing…" at 99+.
  // [url, downloader, status, progress, error, minutesAgo, done?, source, source_label]
  var QUEUE_DEFS = [
    ['https://www.youtube.com/watch?v=pending00001', 'ytdlp', 'pending', 0, null, 1, false, 'web', null],
    ['https://www.reddit.com/gallery/pending00002', 'gallery-dl', 'pending', 0, null, 2, false, 'api', 'Extra tool'],
    ['https://www.youtube.com/watch?v=starting0003', 'ytdlp', 'downloading', 0, null, 3, false, 'web', null],
    ['https://www.youtube.com/watch?v=halfway00004', 'ytdlp', 'downloading', 47.3, null, 4, false, 'web', null],
    ['https://www.tiktok.com/@someone/video/7300000000000000099', 'ytdlp', 'downloading', 99.2, null, 5, false, 'discord', 'Discord'],
    ['https://twitter.com/someone/status/1790000000000000011', 'gallery-dl', 'downloading', 12.5, null, 6, false, 'fluxer', 'Fluxer'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'ytdlp', 'completed', 100, null, 30, true, 'web', null],
    ['https://twitter.com/memes/status/1790000000000000001', 'gallery-dl', 'completed', 100, null, 200, true, 'discord', 'Discord'],
    ['https://www.reddit.com/gallery/catsalbum01', 'gallery-dl', 'completed', 100, null, 300, true, 'api', 'iOS Shortcut'],
    ['https://www.youtube.com/watch?v=private0005', 'ytdlp', 'failed', 0, 'ERROR: [youtube] private0005: Private video. Sign in if you\'ve been granted access to this video', 45, true, 'web', null],
    ['https://example.com/not-a-video', 'ytdlp', 'failed', 0, 'ERROR: Unsupported URL: https://example.com/not-a-video', 90, true, 'discord', 'Discord'],
    ['https://www.instagram.com/p/C0ABCDEFGH/', 'gallery-dl', 'failed', 0, 'interrupted', 400, true, 'fluxer', 'Fluxer'],
    ['https://www.youtube.com/watch?v=toolong0006', 'ytdlp', 'cancelled', 23, 'cancelled', 60, true, 'web', null],
  ]

  var queue = QUEUE_DEFS.map(function (d, i) {
    return {
      id: uuid('queue', i + 1),
      url: d[0],
      downloader: d[1],
      status: d[2],
      progress: d[3],
      error: d[4],
      created_at: isoMinutesAgo(d[5] + 2),
      completed_at: d[6] ? isoMinutesAgo(d[5]) : null,
      source: d[7],
      source_label: d[8],
      include_in_random: 1,
    }
  })

  // Link downloads to the queue row they came from (matching URL). Rows that
  // were cleared from the queue keep a stable id that matches nothing, as in
  // a real install.
  function queueIdFor(url, fallback) {
    for (var i = 0; i < queue.length; i++) if (queue[i].url === url) return queue[i].id
    return fallback
  }
  media.forEach(function (m, i) {
    if (m.url.indexOf('local://') !== 0) m.queue_item_id = queueIdFor(m.url, uuid('queue', 1000 + i))
  })
  albums.forEach(function (a) {
    a.queue_item_id = queueIdFor(a.url, a.queue_item_id)
    a.media.forEach(function (m) { m.queue_item_id = a.queue_item_id })
  })

  var allMedia = media.slice()
  albums.forEach(function (a) { allMedia = allMedia.concat(a.media) })
  allMedia.forEach(function (m) {
    m.tags.forEach(function (t) {
      tags.forEach(function (tag) { if (tag.id === t.id) tag.usage_count += 1 })
    })
  })
  // Most used first, like a tag cloud would want.
  tags.sort(function (a, b) { return b.usage_count - a.usage_count || a.name.localeCompare(b.name) })

  // ----------------------------------------------------------------- shares

  var shares = [
    { token: 'k3Jd9xQ2mPz7', media_id: media[0].id, allow_download: 1, expires_at: null, created_at: isoMinutesAgo(25) },
    { token: 'Wq8LrT1vYb4N', media_id: media[0].id, allow_download: 0, expires_at: '2026-11-17T18:00:00.000Z', created_at: isoMinutesAgo(10) },
    { token: 'Hx2cVn6pEa0S', media_id: media[3].id, allow_download: 1, expires_at: '2026-12-10T18:00:00.000Z', created_at: isoMinutesAgo(500) },
    { token: 'Al5bum7Tk9Zr', album_id: albums[0].id, allow_download: 1, expires_at: null, created_at: isoMinutesAgo(280) },
  ]

  // --------------------------------------------------------------- settings

  // GET /api/settings: every value is a string; _overridden_by_env lists
  // keys locked by environment variables (shown disabled in the UI).
  // Discord/Fluxer flags are 'true'/'false' (discord.rs, fluxer.rs and the
  // settings views compare against 'true'); the share download default is '1'/'0'.
  var settings = {
    download_path: '/data/media',
    random_mode: 'flag', // or 'shared' (SharingView.vue)
    ytdlp_bin: '',
    gallerydl_bin: '',
    ffmpeg_bin: '/usr/bin/ffmpeg',
    ytdlp_extra_args: '--no-playlist',
    gallerydl_extra_args: '',
    share_default_expiry_days: '7',
    share_default_allow_download: '1',
    share_base_url: 'https://memes.example.com',
    discord_enabled: 'true',
    discord_bot_token: '••••••••••••••••',
    discord_client_id: '1234567890123456789',
    discord_command_name: 'get',
    discord_post_as_user: 'true',
    fluxer_enabled: 'false',
    fluxer_bot_token: '',
    fluxer_instance_url: 'https://fluxer.app',
    fluxer_command_prefix: '!',
    fluxer_command_name: 'get',
    fluxer_post_as_user: 'false',
    fluxer_delete_command_message: 'true',
    _overridden_by_env: ['download_path'],
  }

  // GET /api/binaries
  var binaries = {
    ytdlp: { name: 'ytdlp', path: '/data/bin/yt-dlp', exists: true, version: '2026.10.22' },
    'gallery-dl': { name: 'gallery-dl', path: '/data/bin/gallery-dl', exists: false, version: null },
    ffmpeg: { name: 'ffmpeg', path: '/usr/bin/ffmpeg', exists: true, version: '7.1' },
  }

  // GET /api/cookies/{ytdlp,gallerydl}
  var cookies = {
    ytdlp: { exists: true, size: 18432, modifiedAt: isoMinutesAgo(60 * 24 * 3) },
    gallerydl: { exists: false, size: null, modifiedAt: null },
  }

  // GET /api/api-keys (key is only present right after creation)
  var apiKeys = [
    { id: uuid('key', 1), name: 'iOS Shortcut', permission: 'read_write', created_at: isoMinutesAgo(60 * 24 * 60), last_used_at: isoMinutesAgo(300) },
    { id: uuid('key', 2), name: 'Extra tool', permission: 'read_write', created_at: isoMinutesAgo(60 * 24 * 20), last_used_at: isoMinutesAgo(2) },
    { id: uuid('key', 3), name: 'Read-only dashboard', permission: 'read', created_at: isoMinutesAgo(60 * 24 * 5), last_used_at: null },
  ]
  var newApiKey = {
    id: uuid('key', 4), name: 'Just created', permission: 'read', created_at: isoMinutesAgo(0), last_used_at: null,
    key: '9f8e7d6c5b4a39281706f5e4d3c2b1a0', // 16 random bytes as hex, like db.rs
  }

  // ------------------------------------------------------------------ states

  // Canned strings for the empty, loading and error states (VaultView.vue,
  // QueueView.vue), so every style shows the same copy.
  var states = {
    vault: {
      empty: 'Vault is empty. Add a URL or upload a file.',
      loading: 'Loading…',
      error: 'Failed to load',
    },
    queue: {
      empty: 'Queue is empty',
      // QueueView.vue has no loading copy today; styles may design one.
      loading: 'Loading…',
      error: 'Failed',
    },
  }

  window.MOCK = {
    version: '1.2.0',
    media: media,
    albums: albums,
    queue: queue,
    tags: tags,
    shares: shares,
    settings: settings,
    binaries: binaries,
    cookies: cookies,
    apiKeys: apiKeys,
    newApiKey: newApiKey,
    states: states,
    thumbnail: thumbnail,
    /** The queue items the vault shows as in-progress cards. */
    activeQueue: function () {
      return queue.filter(function (q) { return q.status === 'pending' || q.status === 'downloading' })
    },
    /**
     * The share URL MediaModal.vue shows: `${location.origin}/share/<token>`.
     * A fixed origin stands in, because a page opened from disk has none.
     */
    shareUrl: function (token) {
      return 'http://localhost:3000/share/' + token
    },
  }
})()
