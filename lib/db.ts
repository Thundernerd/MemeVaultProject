import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function getDataDir(): string {
  return process.env.MEMEVAULTPROJECT_DATA_DIR ?? path.join(os.homedir(), '.memevaultproject');
}

const DB_PATH = path.join(getDataDir(), 'memevaultproject.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_items (
      id           TEXT PRIMARY KEY,
      url          TEXT NOT NULL,
      downloader   TEXT NOT NULL DEFAULT 'ytdlp',
      status       TEXT NOT NULL DEFAULT 'pending',
      progress     REAL NOT NULL DEFAULT 0,
      error        TEXT,
      created_at   TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS media (
      id             TEXT PRIMARY KEY,
      queue_item_id  TEXT REFERENCES queue_items(id) ON DELETE SET NULL,
      url            TEXT NOT NULL,
      type           TEXT NOT NULL DEFAULT 'video',
      title          TEXT,
      description    TEXT,
      uploader       TEXT,
      duration       REAL,
      thumbnail_path TEXT,
      file_path      TEXT NOT NULL,
      file_size      INTEGER,
      format         TEXT,
      width          INTEGER,
      height         INTEGER,
      created_at     TEXT NOT NULL,
      raw_metadata   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_media_queue_item ON media(queue_item_id);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_items(status);

    CREATE TABLE IF NOT EXISTS albums (
      id            TEXT PRIMARY KEY,
      queue_item_id TEXT REFERENCES queue_items(id) ON DELETE SET NULL,
      url           TEXT NOT NULL,
      title         TEXT,
      uploader      TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_albums_queue_item ON albums(queue_item_id);

    CREATE TABLE IF NOT EXISTS tags (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_tags (
      media_id TEXT NOT NULL REFERENCES media(id)  ON DELETE CASCADE,
      tag_id   TEXT NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (media_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_tags_media ON media_tags(media_id);
    CREATE INDEX IF NOT EXISTS idx_media_tags_tag   ON media_tags(tag_id);

    CREATE TABLE IF NOT EXISTS share_links (
      token          TEXT PRIMARY KEY,
      media_id       TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      allow_download INTEGER NOT NULL DEFAULT 1,
      expires_at     TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_share_links_media ON share_links(media_id);

    CREATE TABLE IF NOT EXISTS album_share_links (
      token          TEXT PRIMARY KEY,
      album_id       TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      allow_download INTEGER NOT NULL DEFAULT 1,
      expires_at     TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_album_share_links_album ON album_share_links(album_id);

    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      key          TEXT NOT NULL UNIQUE,
      permission   TEXT NOT NULL CHECK(permission IN ('read', 'read_write')),
      created_at   TEXT NOT NULL,
      last_used_at TEXT
    );
  `);

  seedDefaultSettings(db);

  // Migration: add album_id to media if it doesn't exist yet
  const mediaCols = db.prepare('PRAGMA table_info(media)').all() as { name: string }[];
  if (!mediaCols.some((c) => c.name === 'album_id')) {
    db.exec(`ALTER TABLE media ADD COLUMN album_id TEXT REFERENCES albums(id) ON DELETE SET NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_media_album ON media(album_id)`);
  }

  // Migration: add include_in_random flag to media if it doesn't exist yet
  if (!mediaCols.some((c) => c.name === 'include_in_random')) {
    db.exec(`ALTER TABLE media ADD COLUMN include_in_random INTEGER NOT NULL DEFAULT 0`);
  }

  // Migration: import legacy single api_key setting into api_keys table (runs once)
  const migrated = db.prepare("SELECT value FROM settings WHERE key = 'api_keys_migrated'").get() as { value: string } | undefined;
  if (!migrated) {
    const legacyRow = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get() as { value: string } | undefined;
    if (legacyRow?.value) {
      db.prepare(
        `INSERT OR IGNORE INTO api_keys (id, name, key, permission, created_at)
         VALUES (?, 'Default', ?, 'read_write', datetime('now'))`
      ).run(uuidv4(), legacyRow.value);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('api_keys_migrated', '1')").run();
  }
}

function seedDefaultSettings(db: Database.Database) {
  const defaults: Record<string, string> = {
    download_path: path.join(getDataDir(), 'media'),
    ytdlp_extra_args: '',
    gallerydl_extra_args: '',
    api_key: uuidv4(),
    ytdlp_bin: '',       // empty = use auto-managed path in ~/.memevaultproject/bin/
    gallerydl_bin: '',   // empty = use auto-managed path in ~/.memevaultproject/bin/
    ffmpeg_bin: '',      // empty = use auto-managed path in ~/.memevaultproject/bin/
    share_default_expiry_days: '',   // empty = never expires
    share_default_allow_download: '1',
    share_base_url: '',              // e.g. https://memes.example.com — required for OG embeds
    random_mode: 'flag',             // 'flag' = include_in_random items, 'shared' = items with active share links
  };

  const insert = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  );
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value);
  }
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Maps each setting key to its corresponding environment variable name. */
export const ENV_OVERRIDES: Record<string, string> = {
  download_path:              'MEMEVAULTPROJECT_DOWNLOAD_PATH',
  ytdlp_extra_args:           'MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS',
  gallerydl_extra_args:       'MEMEVAULTPROJECT_GALLERYDL_EXTRA_ARGS',
  api_key:                    'MEMEVAULTPROJECT_API_KEY',
  ytdlp_bin:                  'MEMEVAULTPROJECT_YTDLP_BIN',
  gallerydl_bin:              'MEMEVAULTPROJECT_GALLERYDL_BIN',
  ffmpeg_bin:                 'MEMEVAULTPROJECT_FFMPEG_BIN',
  share_base_url:             'MEMEVAULTPROJECT_SHARE_BASE_URL',
};

export function getSetting(key: string): string | undefined {
  const envVar = ENV_OVERRIDES[key];
  if (envVar !== undefined && process.env[envVar] !== undefined) {
    return process.env[envVar];
  }
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb()
    .prepare('SELECT key, value FROM settings')
    .all() as { key: string; value: string }[];
  const result = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // Apply env overrides on top
  for (const [key, envVar] of Object.entries(ENV_OVERRIDES)) {
    if (process.env[envVar] !== undefined) {
      result[key] = process.env[envVar] as string;
    }
  }
  return result;
}

/** Returns the list of setting keys currently overridden by an environment variable. */
export function getEnvOverriddenKeys(): string[] {
  return Object.entries(ENV_OVERRIDES)
    .filter(([, envVar]) => process.env[envVar] !== undefined)
    .map(([key]) => key);
}

// ── Queue Items ──────────────────────────────────────────────────────────────

export type Downloader = 'ytdlp' | 'gallery-dl';
export type QueueStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface QueueItem {
  id: string;
  url: string;
  downloader: Downloader;
  status: QueueStatus;
  progress: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export function insertQueueItem(url: string, downloader: Downloader): QueueItem {
  const item: QueueItem = {
    id: uuidv4(),
    url,
    downloader,
    status: 'pending',
    progress: 0,
    error: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  getDb()
    .prepare(
      `INSERT INTO queue_items (id, url, downloader, status, progress, error, created_at, completed_at)
       VALUES (@id, @url, @downloader, @status, @progress, @error, @created_at, @completed_at)`
    )
    .run(item);
  return item;
}

export function getQueueItem(id: string): QueueItem | undefined {
  return getDb()
    .prepare('SELECT * FROM queue_items WHERE id = ?')
    .get(id) as QueueItem | undefined;
}

export function listQueueItems(): QueueItem[] {
  return getDb()
    .prepare('SELECT * FROM queue_items ORDER BY created_at DESC')
    .all() as QueueItem[];
}

export function getNextPendingItem(): QueueItem | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM queue_items WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    )
    .get() as QueueItem | undefined;
}

export function countActiveDownloads(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as n FROM queue_items WHERE status = 'downloading'`)
    .get() as { n: number };
  return row.n;
}

const QUEUE_UPDATABLE_FIELDS = new Set<string>(['status', 'progress', 'error', 'completed_at']);

export function updateQueueItem(
  id: string,
  fields: Partial<Pick<QueueItem, 'status' | 'progress' | 'error' | 'completed_at'>>
): void {
  const keys = Object.keys(fields).filter((k) => QUEUE_UPDATABLE_FIELDS.has(k));
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  getDb()
    .prepare(`UPDATE queue_items SET ${sets} WHERE id = @id`)
    .run({ id, ...fields });
}

export function deleteQueueItem(id: string): void {
  getDb().prepare('DELETE FROM queue_items WHERE id = ?').run(id);
}

// ── Media ────────────────────────────────────────────────────────────────────

export type MediaType = 'video' | 'image';

export interface MediaItem {
  id: string;
  queue_item_id: string | null;
  url: string;
  type: MediaType;
  title: string | null;
  description: string | null;
  uploader: string | null;
  duration: number | null;
  thumbnail_path: string | null;
  file_path: string;
  file_size: number | null;
  format: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  raw_metadata: string | null;
  album_id: string | null;
  include_in_random: number;
}

export function insertMediaItem(item: Omit<MediaItem, 'id' | 'created_at' | 'include_in_random'> & { include_in_random?: number }): MediaItem {
  const full: MediaItem = {
    include_in_random: 0,
    ...item,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO media
         (id, queue_item_id, url, type, title, description, uploader, duration,
          thumbnail_path, file_path, file_size, format, width, height, created_at, raw_metadata, album_id, include_in_random)
       VALUES
         (@id, @queue_item_id, @url, @type, @title, @description, @uploader, @duration,
          @thumbnail_path, @file_path, @file_size, @format, @width, @height, @created_at, @raw_metadata, @album_id, @include_in_random)`
    )
    .run(full);
  return full;
}

export function getMediaItem(id: string): MediaItem | undefined {
  return getDb()
    .prepare('SELECT * FROM media WHERE id = ?')
    .get(id) as MediaItem | undefined;
}

export function listMediaItems(): MediaItem[] {
  return getDb()
    .prepare('SELECT * FROM media ORDER BY created_at DESC')
    .all() as MediaItem[];
}

export function getMediaByQueueItem(queueItemId: string): MediaItem[] {
  return getDb()
    .prepare('SELECT * FROM media WHERE queue_item_id = ?')
    .all(queueItemId) as MediaItem[];
}

export function deleteMediaItem(id: string): MediaItem | undefined {
  const item = getMediaItem(id);
  if (item) getDb().prepare('DELETE FROM media WHERE id = ?').run(id);
  return item;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  created_at: string;
}

export interface TagWithCount extends Tag {
  usage_count: number;
}

/** Find or create a tag by name (case-insensitive). Returns the tag. */
export function upsertTag(name: string): Tag {
  const db = getDb();
  const trimmed = name.trim();
  const existing = db
    .prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE')
    .get(trimmed) as Tag | undefined;
  if (existing) return existing;

  const tag: Tag = { id: uuidv4(), name: trimmed, created_at: new Date().toISOString() };
  db.prepare('INSERT INTO tags (id, name, created_at) VALUES (@id, @name, @created_at)').run(tag);
  return tag;
}

export function listAllTags(): TagWithCount[] {
  return getDb()
    .prepare(
      `SELECT t.*, COUNT(mt.media_id) as usage_count
       FROM tags t
       LEFT JOIN media_tags mt ON mt.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`
    )
    .all() as TagWithCount[];
}

export function deleteTag(id: string): void {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id);
}

export function addTagToMedia(mediaId: string, tagId: string): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)')
    .run(mediaId, tagId);
}

export function removeTagFromMedia(mediaId: string, tagId: string): void {
  getDb()
    .prepare('DELETE FROM media_tags WHERE media_id = ? AND tag_id = ?')
    .run(mediaId, tagId);
}

export function getTagsForMedia(mediaId: string): Tag[] {
  return getDb()
    .prepare(
      `SELECT t.* FROM tags t
       JOIN media_tags mt ON mt.tag_id = t.id
       WHERE mt.media_id = ?
       ORDER BY t.name ASC`
    )
    .all(mediaId) as Tag[];
}

/** Replace all tags on a media item with the given tag names. */
export function setTagsForMedia(mediaId: string, names: string[]): Tag[] {
  const db = getDb();
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM media_tags WHERE media_id = ?').run(mediaId);
    const result: Tag[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const tag = upsertTag(name);
      db.prepare('INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)').run(mediaId, tag.id);
      result.push(tag);
    }
    return result;
  });
  return replace();
}

export type MediaItemWithTags = MediaItem & { tags: Tag[] };

type MediaJoinRow = MediaItem & {
  tag_id: string | null;
  tag_name: string | null;
  tag_created_at: string | null;
};

/** Collapses flat JOIN rows (media + tag columns) into `MediaItemWithTags[]`. */
function collapseMediaRows(rows: MediaJoinRow[]): MediaItemWithTags[] {
  const itemMap = new Map<string, MediaItemWithTags>();
  for (const row of rows) {
    let item = itemMap.get(row.id);
    if (!item) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tag_id, tag_name, tag_created_at, ...mediaFields } = row;
      item = { ...(mediaFields as MediaItem), tags: [] };
      itemMap.set(row.id, item);
    }
    if (row.tag_id && row.tag_name && row.tag_created_at) {
      item.tags.push({ id: row.tag_id, name: row.tag_name, created_at: row.tag_created_at });
    }
  }
  return Array.from(itemMap.values());
}

/** Returns media items with an embedded tags array, using a single JOIN query. */
export function listMediaItemsWithTags(): MediaItemWithTags[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
       FROM media m
       LEFT JOIN media_tags mt ON mt.media_id = m.id
       LEFT JOIN tags t ON t.id = mt.tag_id
       WHERE m.album_id IS NULL
       ORDER BY m.created_at DESC, t.name ASC`
    )
    .all() as MediaJoinRow[];
  return collapseMediaRows(rows);
}

export function getMediaItemWithTags(id: string): MediaItemWithTags | undefined {
  const item = getMediaItem(id);
  if (!item) return undefined;
  return { ...item, tags: getTagsForMedia(id) };
}

export function setMediaRandomFlag(id: string, value: boolean): void {
  getDb()
    .prepare('UPDATE media SET include_in_random = ? WHERE id = ?')
    .run(value ? 1 : 0, id);
}

/** Returns all media items that have include_in_random = 1, with tags. */
export function listRandomCandidatesWithTags(): MediaItemWithTags[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
       FROM media m
       LEFT JOIN media_tags mt ON mt.media_id = m.id
       LEFT JOIN tags t ON t.id = mt.tag_id
       WHERE m.include_in_random = 1
       ORDER BY m.id, t.name ASC`
    )
    .all() as MediaJoinRow[];
  return collapseMediaRows(rows);
}

/** Returns all media items that have at least one active (non-expired) share link, with tags. */
export function listSharedMediaWithTags(): MediaItemWithTags[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
       FROM media m
       LEFT JOIN media_tags mt ON mt.media_id = m.id
       LEFT JOIN tags t ON t.id = mt.tag_id
       WHERE EXISTS (
         SELECT 1 FROM share_links sl
         WHERE sl.media_id = m.id
           AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now'))
       )
       ORDER BY m.id, t.name ASC`
    )
    .all() as MediaJoinRow[];
  return collapseMediaRows(rows);
}

// ── Albums ────────────────────────────────────────────────────────────────────

export interface Album {
  id: string;
  queue_item_id: string | null;
  url: string;
  title: string | null;
  uploader: string | null;
  created_at: string;
}

export type AlbumWithMedia = Album & { media: MediaItemWithTags[] };

export function insertAlbum(item: Omit<Album, 'id' | 'created_at'>): Album {
  const full: Album = {
    ...item,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO albums (id, queue_item_id, url, title, uploader, created_at)
       VALUES (@id, @queue_item_id, @url, @title, @uploader, @created_at)`
    )
    .run(full);
  return full;
}

export function getAlbum(id: string): Album | undefined {
  return getDb().prepare('SELECT * FROM albums WHERE id = ?').get(id) as Album | undefined;
}

export function getMediaItemsByAlbum(albumId: string): MediaItemWithTags[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
       FROM media m
       LEFT JOIN media_tags mt ON mt.media_id = m.id
       LEFT JOIN tags t ON t.id = mt.tag_id
       WHERE m.album_id = ?
       ORDER BY m.created_at ASC, t.name ASC`
    )
    .all(albumId) as MediaJoinRow[];
  return collapseMediaRows(rows);
}

export function listAlbumsWithMedia(): AlbumWithMedia[] {
  const albums = getDb()
    .prepare('SELECT * FROM albums ORDER BY created_at DESC')
    .all() as Album[];
  return albums.map((album) => ({
    ...album,
    media: getMediaItemsByAlbum(album.id),
  }));
}

export function getAlbumWithMedia(id: string): AlbumWithMedia | undefined {
  const album = getAlbum(id);
  if (!album) return undefined;
  return { ...album, media: getMediaItemsByAlbum(id) };
}

export function deleteAlbum(id: string): AlbumWithMedia | undefined {
  const album = getAlbumWithMedia(id);
  if (!album) return undefined;
  const db = getDb();
  const deleteMedia = db.prepare('DELETE FROM media WHERE album_id = ?');
  const deleteAlbumRow = db.prepare('DELETE FROM albums WHERE id = ?');
  db.transaction(() => {
    deleteMedia.run(id);
    deleteAlbumRow.run(id);
  })();
  return album;
}

// ── Share Links ───────────────────────────────────────────────────────────────

export interface ShareLink {
  token: string;
  media_id: string;
  allow_download: number; // 1 = allowed, 0 = not allowed
  expires_at: string | null;
  created_at: string;
}

export function createShareLink(
  mediaId: string,
  allowDownload: boolean,
  expiresAt: string | null
): ShareLink {
  const link: ShareLink = {
    token: uuidv4(),
    media_id: mediaId,
    allow_download: allowDownload ? 1 : 0,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO share_links (token, media_id, allow_download, expires_at, created_at)
       VALUES (@token, @media_id, @allow_download, @expires_at, @created_at)`
    )
    .run(link);
  return link;
}

export function getShareLink(token: string): ShareLink | undefined {
  return getDb()
    .prepare('SELECT * FROM share_links WHERE token = ?')
    .get(token) as ShareLink | undefined;
}

export function deleteShareLink(token: string): void {
  getDb().prepare('DELETE FROM share_links WHERE token = ?').run(token);
}

export function getShareLinksForMedia(mediaId: string): ShareLink[] {
  return getDb()
    .prepare('SELECT * FROM share_links WHERE media_id = ? ORDER BY created_at DESC')
    .all(mediaId) as ShareLink[];
}

// ── Album Share Links ─────────────────────────────────────────────────────────

export interface AlbumShareLink {
  token: string;
  album_id: string;
  allow_download: number; // 1 = allowed, 0 = not allowed
  expires_at: string | null;
  created_at: string;
}

export function createAlbumShareLink(
  albumId: string,
  allowDownload: boolean,
  expiresAt: string | null
): AlbumShareLink {
  const link: AlbumShareLink = {
    token: uuidv4(),
    album_id: albumId,
    allow_download: allowDownload ? 1 : 0,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO album_share_links (token, album_id, allow_download, expires_at, created_at)
       VALUES (@token, @album_id, @allow_download, @expires_at, @created_at)`
    )
    .run(link);
  return link;
}

export function getAlbumShareLink(token: string): AlbumShareLink | undefined {
  return getDb()
    .prepare('SELECT * FROM album_share_links WHERE token = ?')
    .get(token) as AlbumShareLink | undefined;
}

export function deleteAlbumShareLink(token: string): void {
  getDb().prepare('DELETE FROM album_share_links WHERE token = ?').run(token);
}

export function getAlbumShareLinksForAlbum(albumId: string): AlbumShareLink[] {
  return getDb()
    .prepare('SELECT * FROM album_share_links WHERE album_id = ? ORDER BY created_at DESC')
    .all(albumId) as AlbumShareLink[];
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export type ApiKeyPermission = 'read' | 'read_write';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permission: ApiKeyPermission;
  created_at: string;
  last_used_at: string | null;
}

function generateApiKey(): string {
  return randomBytes(16).toString('hex');
}

export function createApiKey(name: string, permission: ApiKeyPermission): ApiKey {
  const record: ApiKey = {
    id: uuidv4(),
    name,
    key: generateApiKey(),
    permission,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  getDb()
    .prepare(
      `INSERT INTO api_keys (id, name, key, permission, created_at, last_used_at)
       VALUES (@id, @name, @key, @permission, @created_at, @last_used_at)`
    )
    .run(record);
  return record;
}

export function listApiKeys(): Omit<ApiKey, 'key'>[] {
  return getDb()
    .prepare('SELECT id, name, permission, created_at, last_used_at FROM api_keys ORDER BY created_at ASC')
    .all() as Omit<ApiKey, 'key'>[];
}

export function getApiKeyByValue(key: string): ApiKey | undefined {
  return getDb()
    .prepare('SELECT * FROM api_keys WHERE key = ?')
    .get(key) as ApiKey | undefined;
}

export function deleteApiKey(id: string): void {
  getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id);
}

export function touchApiKeyLastUsed(id: string): void {
  getDb()
    .prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`)
    .run(id);
}
