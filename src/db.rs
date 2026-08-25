//! SQLite access — schema identical to V1 `lib/db.ts`.

use crate::config::Config;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;
use uuid::Uuid;

pub type DbPool = Pool<SqliteConnectionManager>;

#[derive(Clone)]
pub struct Db {
    pool: DbPool,
}

impl Db {
    pub fn open(config: &Config) -> anyhow::Result<Self> {
        std::fs::create_dir_all(&config.data_dir)?;
        let db_path = config.db_path();
        tracing::info!(db_path = %db_path.display(), "opening database");
        let manager = SqliteConnectionManager::file(&db_path);
        let pool = Pool::builder().max_size(8).build(manager)?;
        let conn = pool.get()?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )?;
        init_schema(&conn, &config.data_dir)?;
        Ok(Self { pool })
    }

    pub fn with_conn<F, T>(&self, f: F) -> Result<T, crate::error::AppError>
    where
        F: FnOnce(&rusqlite::Connection) -> Result<T, crate::error::AppError>,
    {
        let conn = self.pool.get()?;
        f(&conn)
    }
}

fn init_schema(db: &rusqlite::Connection, data_dir: &Path) -> anyhow::Result<()> {
    db.execute_batch(
        r#"
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
        "#,
    )?;

    seed_default_settings(db, data_dir)?;

    let media_cols: Vec<String> = {
        let mut stmt = db.prepare("PRAGMA table_info(media)")?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        cols
    };

    if !media_cols.iter().any(|c| c == "album_id") {
        db.execute_batch(
            "ALTER TABLE media ADD COLUMN album_id TEXT REFERENCES albums(id) ON DELETE SET NULL;
             CREATE INDEX IF NOT EXISTS idx_media_album ON media(album_id);",
        )?;
    }
    if !media_cols.iter().any(|c| c == "include_in_random") {
        db.execute(
            "ALTER TABLE media ADD COLUMN include_in_random INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    let migrated: Option<String> = db
        .query_row(
            "SELECT value FROM settings WHERE key = 'api_keys_migrated'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if migrated.is_none() {
        let legacy: Option<String> = db
            .query_row(
                "SELECT value FROM settings WHERE key = 'api_key'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(key) = legacy {
            db.execute(
                "INSERT OR IGNORE INTO api_keys (id, name, key, permission, created_at)
                 VALUES (?, 'Default', ?, 'read_write', datetime('now'))",
                params![Uuid::new_v4().to_string(), key],
            )?;
        }
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('api_keys_migrated', '1')",
            [],
        )?;
    }

    Ok(())
}

fn seed_default_settings(db: &rusqlite::Connection, data_dir: &Path) -> anyhow::Result<()> {
    let download_path = data_dir.join("media").to_string_lossy().to_string();
    let defaults = [
        ("download_path", download_path.as_str()),
        ("ytdlp_extra_args", ""),
        ("gallerydl_extra_args", ""),
        ("api_key", &Uuid::new_v4().to_string()),
        ("ytdlp_bin", ""),
        ("gallerydl_bin", ""),
        ("ffmpeg_bin", ""),
        ("share_default_expiry_days", ""),
        ("share_default_allow_download", "1"),
        ("share_base_url", ""),
        ("random_mode", "flag"),
    ];
    let mut stmt = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")?;
    for (k, v) in defaults {
        stmt.execute(params![k, v])?;
    }
    Ok(())
}

pub static ENV_OVERRIDES: &[(&str, &str)] = &[
    ("download_path", "MEMEVAULTPROJECT_DOWNLOAD_PATH"),
    ("ytdlp_extra_args", "MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS"),
    ("gallerydl_extra_args", "MEMEVAULTPROJECT_GALLERYDL_EXTRA_ARGS"),
    ("api_key", "MEMEVAULTPROJECT_API_KEY"),
    ("ytdlp_bin", "MEMEVAULTPROJECT_YTDLP_BIN"),
    ("gallerydl_bin", "MEMEVAULTPROJECT_GALLERYDL_BIN"),
    ("ffmpeg_bin", "MEMEVAULTPROJECT_FFMPEG_BIN"),
    ("share_base_url", "MEMEVAULTPROJECT_SHARE_BASE_URL"),
];

pub fn get_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    if let Some((_, env_var)) = ENV_OVERRIDES.iter().find(|(k, _)| *k == key) {
        if let Ok(v) = std::env::var(env_var) {
            return Some(v);
        }
    }
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        [key],
        |r| r.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_all_settings(conn: &rusqlite::Connection) -> rusqlite::Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let mut map: HashMap<String, String> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (key, env_var) in ENV_OVERRIDES {
        if let Ok(v) = std::env::var(env_var) {
            map.insert((*key).to_string(), v);
        }
    }
    Ok(map)
}

pub fn get_env_overridden_keys() -> Vec<String> {
    ENV_OVERRIDES
        .iter()
        .filter(|(_, env)| std::env::var(env).is_ok())
        .map(|(k, _)| (*k).to_string())
        .collect()
}

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub url: String,
    pub downloader: String,
    pub status: String,
    pub progress: f64,
    pub error: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub queue_item_id: Option<String>,
    pub url: String,
    #[serde(rename = "type")]
    pub media_type: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub format: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub created_at: String,
    pub raw_metadata: Option<String>,
    pub album_id: Option<String>,
    pub include_in_random: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagWithCount {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub usage_count: i64,
}

#[derive(Debug, Clone)]
pub struct MediaItemWithTags {
    pub media: MediaItem,
    pub tags: Vec<Tag>,
}

impl Serialize for MediaItemWithTags {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.media.id)?;
        map.serialize_entry("queue_item_id", &self.media.queue_item_id)?;
        map.serialize_entry("url", &self.media.url)?;
        map.serialize_entry("type", &self.media.media_type)?;
        map.serialize_entry("title", &self.media.title)?;
        map.serialize_entry("description", &self.media.description)?;
        map.serialize_entry("uploader", &self.media.uploader)?;
        map.serialize_entry("duration", &self.media.duration)?;
        map.serialize_entry("thumbnail_path", &self.media.thumbnail_path)?;
        map.serialize_entry("file_path", &self.media.file_path)?;
        map.serialize_entry("file_size", &self.media.file_size)?;
        map.serialize_entry("format", &self.media.format)?;
        map.serialize_entry("width", &self.media.width)?;
        map.serialize_entry("height", &self.media.height)?;
        map.serialize_entry("created_at", &self.media.created_at)?;
        map.serialize_entry("raw_metadata", &self.media.raw_metadata)?;
        map.serialize_entry("album_id", &self.media.album_id)?;
        map.serialize_entry("include_in_random", &self.media.include_in_random)?;
        map.serialize_entry("tags", &self.tags)?;
        map.end()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: String,
    pub queue_item_id: Option<String>,
    pub url: String,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct AlbumWithMedia {
    pub album: Album,
    pub media: Vec<MediaItemWithTags>,
}

impl Serialize for AlbumWithMedia {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.album.id)?;
        map.serialize_entry("queue_item_id", &self.album.queue_item_id)?;
        map.serialize_entry("url", &self.album.url)?;
        map.serialize_entry("title", &self.album.title)?;
        map.serialize_entry("uploader", &self.album.uploader)?;
        map.serialize_entry("created_at", &self.album.created_at)?;
        map.serialize_entry("media", &self.media)?;
        map.end()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareLink {
    pub token: String,
    pub media_id: String,
    pub allow_download: i64,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumShareLink {
    pub token: String,
    pub album_id: String,
    pub allow_download: i64,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: String,
    pub name: String,
    pub key: String,
    pub permission: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn map_queue(row: &rusqlite::Row<'_>) -> rusqlite::Result<QueueItem> {
    Ok(QueueItem {
        id: row.get(0)?,
        url: row.get(1)?,
        downloader: row.get(2)?,
        status: row.get(3)?,
        progress: row.get(4)?,
        error: row.get(5)?,
        created_at: row.get(6)?,
        completed_at: row.get(7)?,
    })
}

fn map_media(row: &rusqlite::Row<'_>) -> rusqlite::Result<MediaItem> {
    Ok(MediaItem {
        id: row.get("id")?,
        queue_item_id: row.get("queue_item_id")?,
        url: row.get("url")?,
        media_type: row.get("type")?,
        title: row.get("title")?,
        description: row.get("description")?,
        uploader: row.get("uploader")?,
        duration: row.get("duration")?,
        thumbnail_path: row.get("thumbnail_path")?,
        file_path: row.get("file_path")?,
        file_size: row.get("file_size")?,
        format: row.get("format")?,
        width: row.get("width")?,
        height: row.get("height")?,
        created_at: row.get("created_at")?,
        raw_metadata: row.get("raw_metadata")?,
        album_id: row.get("album_id")?,
        include_in_random: row.get("include_in_random")?,
    })
}

// ── Queue ────────────────────────────────────────────────────────────────────

pub fn insert_queue_item(
    conn: &rusqlite::Connection,
    url: &str,
    downloader: &str,
) -> rusqlite::Result<QueueItem> {
    let item = QueueItem {
        id: Uuid::new_v4().to_string(),
        url: url.to_string(),
        downloader: downloader.to_string(),
        status: "pending".into(),
        progress: 0.0,
        error: None,
        created_at: now_iso(),
        completed_at: None,
    };
    conn.execute(
        "INSERT INTO queue_items (id, url, downloader, status, progress, error, created_at, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            item.id,
            item.url,
            item.downloader,
            item.status,
            item.progress,
            item.error,
            item.created_at,
            item.completed_at
        ],
    )?;
    Ok(item)
}

pub fn get_queue_item(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<Option<QueueItem>> {
    conn.query_row("SELECT * FROM queue_items WHERE id = ?", [id], map_queue)
        .optional()
}

pub fn list_queue_items(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<QueueItem>> {
    let mut stmt = conn.prepare("SELECT * FROM queue_items ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], map_queue)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_next_pending_item(conn: &rusqlite::Connection) -> rusqlite::Result<Option<QueueItem>> {
    conn.query_row(
        "SELECT * FROM queue_items WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
        [],
        map_queue,
    )
    .optional()
}

pub fn count_active_downloads(conn: &rusqlite::Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM queue_items WHERE status = 'downloading'",
        [],
        |r| r.get(0),
    )
}

pub fn reset_stale_downloads(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE queue_items SET status = 'pending', progress = 0 WHERE status = 'downloading'",
        [],
    )
}

pub fn update_queue_item(
    conn: &rusqlite::Connection,
    id: &str,
    status: Option<&str>,
    progress: Option<f64>,
    error: Option<Option<&str>>,
    completed_at: Option<Option<&str>>,
) -> rusqlite::Result<()> {
    if let Some(s) = status {
        conn.execute("UPDATE queue_items SET status = ? WHERE id = ?", params![s, id])?;
    }
    if let Some(p) = progress {
        conn.execute("UPDATE queue_items SET progress = ? WHERE id = ?", params![p, id])?;
    }
    if let Some(e) = error {
        conn.execute("UPDATE queue_items SET error = ? WHERE id = ?", params![e, id])?;
    }
    if let Some(c) = completed_at {
        conn.execute(
            "UPDATE queue_items SET completed_at = ? WHERE id = ?",
            params![c, id],
        )?;
    }
    Ok(())
}

pub fn delete_queue_item(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM queue_items WHERE id = ?", [id])?;
    Ok(())
}

// ── Media ────────────────────────────────────────────────────────────────────

pub struct NewMedia<'a> {
    pub queue_item_id: Option<&'a str>,
    pub url: &'a str,
    pub media_type: &'a str,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub uploader: Option<&'a str>,
    pub duration: Option<f64>,
    pub thumbnail_path: Option<&'a str>,
    pub file_path: &'a str,
    pub file_size: Option<i64>,
    pub format: Option<&'a str>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub raw_metadata: Option<&'a str>,
    pub album_id: Option<&'a str>,
    pub include_in_random: i64,
}

pub fn insert_media_item(conn: &rusqlite::Connection, item: NewMedia<'_>) -> rusqlite::Result<MediaItem> {
    let full = MediaItem {
        id: Uuid::new_v4().to_string(),
        queue_item_id: item.queue_item_id.map(|s| s.to_string()),
        url: item.url.to_string(),
        media_type: item.media_type.to_string(),
        title: item.title.map(|s| s.to_string()),
        description: item.description.map(|s| s.to_string()),
        uploader: item.uploader.map(|s| s.to_string()),
        duration: item.duration,
        thumbnail_path: item.thumbnail_path.map(|s| s.to_string()),
        file_path: item.file_path.to_string(),
        file_size: item.file_size,
        format: item.format.map(|s| s.to_string()),
        width: item.width,
        height: item.height,
        created_at: now_iso(),
        raw_metadata: item.raw_metadata.map(|s| s.to_string()),
        album_id: item.album_id.map(|s| s.to_string()),
        include_in_random: item.include_in_random,
    };
    conn.execute(
        "INSERT INTO media
           (id, queue_item_id, url, type, title, description, uploader, duration,
            thumbnail_path, file_path, file_size, format, width, height, created_at, raw_metadata, album_id, include_in_random)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            full.id,
            full.queue_item_id,
            full.url,
            full.media_type,
            full.title,
            full.description,
            full.uploader,
            full.duration,
            full.thumbnail_path,
            full.file_path,
            full.file_size,
            full.format,
            full.width,
            full.height,
            full.created_at,
            full.raw_metadata,
            full.album_id,
            full.include_in_random,
        ],
    )?;
    Ok(full)
}

pub fn get_media_item(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<Option<MediaItem>> {
    conn.query_row("SELECT * FROM media WHERE id = ?", [id], map_media)
        .optional()
}

pub fn get_media_by_queue_item(
    conn: &rusqlite::Connection,
    queue_item_id: &str,
) -> rusqlite::Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare("SELECT * FROM media WHERE queue_item_id = ?")?;
    let rows = stmt
        .query_map([queue_item_id], map_media)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn delete_media_item(
    conn: &rusqlite::Connection,
    id: &str,
) -> rusqlite::Result<Option<MediaItem>> {
    let item = get_media_item(conn, id)?;
    if item.is_some() {
        conn.execute("DELETE FROM media WHERE id = ?", [id])?;
    }
    Ok(item)
}

pub fn set_media_random_flag(
    conn: &rusqlite::Connection,
    id: &str,
    value: bool,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE media SET include_in_random = ? WHERE id = ?",
        params![if value { 1 } else { 0 }, id],
    )?;
    Ok(())
}

pub fn get_tags_for_media(conn: &rusqlite::Connection, media_id: &str) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.created_at FROM tags t
         JOIN media_tags mt ON mt.tag_id = t.id
         WHERE mt.media_id = ?
         ORDER BY t.name ASC",
    )?;
    let rows = stmt
        .query_map([media_id], |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_media_item_with_tags(
    conn: &rusqlite::Connection,
    id: &str,
) -> rusqlite::Result<Option<MediaItemWithTags>> {
    let Some(media) = get_media_item(conn, id)? else {
        return Ok(None);
    };
    let tags = get_tags_for_media(conn, id)?;
    Ok(Some(MediaItemWithTags { media, tags }))
}

fn collapse_media_join(
    rows: Vec<(MediaItem, Option<Tag>)>,
) -> Vec<MediaItemWithTags> {
    let mut map: HashMap<String, MediaItemWithTags> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    for (media, tag) in rows {
        let id = media.id.clone();
        if !map.contains_key(&id) {
            order.push(id.clone());
            map.insert(
                id.clone(),
                MediaItemWithTags {
                    media,
                    tags: Vec::new(),
                },
            );
        }
        if let Some(t) = tag {
            if let Some(item) = map.get_mut(&id) {
                item.tags.push(t);
            }
        }
    }
    order
        .into_iter()
        .filter_map(|id| map.remove(&id))
        .collect()
}

fn query_media_with_tags(
    conn: &rusqlite::Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> rusqlite::Result<Vec<MediaItemWithTags>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(params, |row| {
            let media = map_media(row)?;
            let tag_id: Option<String> = row.get("tag_id")?;
            let tag = if let Some(id) = tag_id {
                Some(Tag {
                    id,
                    name: row.get("tag_name")?,
                    created_at: row.get("tag_created_at")?,
                })
            } else {
                None
            };
            Ok((media, tag))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(collapse_media_join(rows))
}

pub fn list_media_items_with_tags(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<Vec<MediaItemWithTags>> {
    query_media_with_tags(
        conn,
        "SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
         FROM media m
         LEFT JOIN media_tags mt ON mt.media_id = m.id
         LEFT JOIN tags t ON t.id = mt.tag_id
         WHERE m.album_id IS NULL
         ORDER BY m.created_at DESC, t.name ASC",
        [],
    )
}

pub fn list_random_candidates_with_tags(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<Vec<MediaItemWithTags>> {
    query_media_with_tags(
        conn,
        "SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
         FROM media m
         LEFT JOIN media_tags mt ON mt.media_id = m.id
         LEFT JOIN tags t ON t.id = mt.tag_id
         WHERE m.include_in_random = 1
         ORDER BY m.id, t.name ASC",
        [],
    )
}

pub fn list_shared_media_with_tags(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<Vec<MediaItemWithTags>> {
    query_media_with_tags(
        conn,
        "SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
         FROM media m
         LEFT JOIN media_tags mt ON mt.media_id = m.id
         LEFT JOIN tags t ON t.id = mt.tag_id
         WHERE EXISTS (
           SELECT 1 FROM share_links sl
           WHERE sl.media_id = m.id
             AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now'))
         )
         ORDER BY m.id, t.name ASC",
        [],
    )
}

// ── Tags ─────────────────────────────────────────────────────────────────────

pub fn upsert_tag(conn: &rusqlite::Connection, name: &str) -> rusqlite::Result<Tag> {
    let trimmed = name.trim();
    if let Some(existing) = conn
        .query_row(
            "SELECT id, name, created_at FROM tags WHERE name = ? COLLATE NOCASE",
            [trimmed],
            |r| {
                Ok(Tag {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created_at: r.get(2)?,
                })
            },
        )
        .optional()?
    {
        return Ok(existing);
    }
    let tag = Tag {
        id: Uuid::new_v4().to_string(),
        name: trimmed.to_string(),
        created_at: now_iso(),
    };
    conn.execute(
        "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![tag.id, tag.name, tag.created_at],
    )?;
    Ok(tag)
}

pub fn list_all_tags(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<TagWithCount>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.created_at, COUNT(mt.media_id) as usage_count
         FROM tags t
         LEFT JOIN media_tags mt ON mt.tag_id = t.id
         GROUP BY t.id
         ORDER BY t.name ASC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TagWithCount {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                usage_count: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn delete_tag(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM tags WHERE id = ?", [id])?;
    Ok(())
}

pub fn add_tag_to_media(
    conn: &rusqlite::Connection,
    media_id: &str,
    tag_id: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)",
        params![media_id, tag_id],
    )?;
    Ok(())
}

pub fn set_tags_for_media(
    conn: &rusqlite::Connection,
    media_id: &str,
    names: &[String],
) -> rusqlite::Result<Vec<Tag>> {
    conn.execute("DELETE FROM media_tags WHERE media_id = ?", [media_id])?;
    let mut result = Vec::new();
    for raw in names {
        let name = raw.trim();
        if name.is_empty() {
            continue;
        }
        let tag = upsert_tag(conn, name)?;
        conn.execute(
            "INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)",
            params![media_id, tag.id],
        )?;
        result.push(tag);
    }
    Ok(result)
}

// ── Albums ───────────────────────────────────────────────────────────────────

pub fn insert_album(
    conn: &rusqlite::Connection,
    queue_item_id: Option<&str>,
    url: &str,
    title: Option<&str>,
    uploader: Option<&str>,
) -> rusqlite::Result<Album> {
    let album = Album {
        id: Uuid::new_v4().to_string(),
        queue_item_id: queue_item_id.map(|s| s.to_string()),
        url: url.to_string(),
        title: title.map(|s| s.to_string()),
        uploader: uploader.map(|s| s.to_string()),
        created_at: now_iso(),
    };
    conn.execute(
        "INSERT INTO albums (id, queue_item_id, url, title, uploader, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            album.id,
            album.queue_item_id,
            album.url,
            album.title,
            album.uploader,
            album.created_at
        ],
    )?;
    Ok(album)
}

pub fn get_album(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<Option<Album>> {
    conn.query_row(
        "SELECT id, queue_item_id, url, title, uploader, created_at FROM albums WHERE id = ?",
        [id],
        |r| {
            Ok(Album {
                id: r.get(0)?,
                queue_item_id: r.get(1)?,
                url: r.get(2)?,
                title: r.get(3)?,
                uploader: r.get(4)?,
                created_at: r.get(5)?,
            })
        },
    )
    .optional()
}

pub fn get_media_items_by_album(
    conn: &rusqlite::Connection,
    album_id: &str,
) -> rusqlite::Result<Vec<MediaItemWithTags>> {
    query_media_with_tags(
        conn,
        "SELECT m.*, t.id AS tag_id, t.name AS tag_name, t.created_at AS tag_created_at
         FROM media m
         LEFT JOIN media_tags mt ON mt.media_id = m.id
         LEFT JOIN tags t ON t.id = mt.tag_id
         WHERE m.album_id = ?
         ORDER BY m.created_at ASC, t.name ASC",
        [album_id],
    )
}

pub fn list_albums_with_media(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<AlbumWithMedia>> {
    let mut stmt =
        conn.prepare("SELECT id, queue_item_id, url, title, uploader, created_at FROM albums ORDER BY created_at DESC")?;
    let albums: Vec<Album> = stmt
        .query_map([], |r| {
            Ok(Album {
                id: r.get(0)?,
                queue_item_id: r.get(1)?,
                url: r.get(2)?,
                title: r.get(3)?,
                uploader: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    albums
        .into_iter()
        .map(|album| {
            let media = get_media_items_by_album(conn, &album.id)?;
            Ok(AlbumWithMedia { album, media })
        })
        .collect()
}

pub fn get_album_with_media(
    conn: &rusqlite::Connection,
    id: &str,
) -> rusqlite::Result<Option<AlbumWithMedia>> {
    let Some(album) = get_album(conn, id)? else {
        return Ok(None);
    };
    let media = get_media_items_by_album(conn, id)?;
    Ok(Some(AlbumWithMedia { album, media }))
}

pub fn delete_album(
    conn: &rusqlite::Connection,
    id: &str,
) -> rusqlite::Result<Option<AlbumWithMedia>> {
    let Some(album) = get_album_with_media(conn, id)? else {
        return Ok(None);
    };
    conn.execute("DELETE FROM media WHERE album_id = ?", [id])?;
    conn.execute("DELETE FROM albums WHERE id = ?", [id])?;
    Ok(Some(album))
}

// ── Share links ──────────────────────────────────────────────────────────────

pub fn create_share_link(
    conn: &rusqlite::Connection,
    media_id: &str,
    allow_download: bool,
    expires_at: Option<&str>,
) -> rusqlite::Result<ShareLink> {
    let link = ShareLink {
        token: Uuid::new_v4().to_string(),
        media_id: media_id.to_string(),
        allow_download: if allow_download { 1 } else { 0 },
        expires_at: expires_at.map(|s| s.to_string()),
        created_at: now_iso(),
    };
    conn.execute(
        "INSERT INTO share_links (token, media_id, allow_download, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            link.token,
            link.media_id,
            link.allow_download,
            link.expires_at,
            link.created_at
        ],
    )?;
    Ok(link)
}

pub fn get_share_link(conn: &rusqlite::Connection, token: &str) -> rusqlite::Result<Option<ShareLink>> {
    conn.query_row(
        "SELECT token, media_id, allow_download, expires_at, created_at FROM share_links WHERE token = ?",
        [token],
        |r| {
            Ok(ShareLink {
                token: r.get(0)?,
                media_id: r.get(1)?,
                allow_download: r.get(2)?,
                expires_at: r.get(3)?,
                created_at: r.get(4)?,
            })
        },
    )
    .optional()
}

pub fn delete_share_link(conn: &rusqlite::Connection, token: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM share_links WHERE token = ?", [token])?;
    Ok(())
}

pub fn get_share_links_for_media(
    conn: &rusqlite::Connection,
    media_id: &str,
) -> rusqlite::Result<Vec<ShareLink>> {
    let mut stmt = conn.prepare(
        "SELECT token, media_id, allow_download, expires_at, created_at FROM share_links
         WHERE media_id = ? ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map([media_id], |r| {
            Ok(ShareLink {
                token: r.get(0)?,
                media_id: r.get(1)?,
                allow_download: r.get(2)?,
                expires_at: r.get(3)?,
                created_at: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn create_album_share_link(
    conn: &rusqlite::Connection,
    album_id: &str,
    allow_download: bool,
    expires_at: Option<&str>,
) -> rusqlite::Result<AlbumShareLink> {
    let link = AlbumShareLink {
        token: Uuid::new_v4().to_string(),
        album_id: album_id.to_string(),
        allow_download: if allow_download { 1 } else { 0 },
        expires_at: expires_at.map(|s| s.to_string()),
        created_at: now_iso(),
    };
    conn.execute(
        "INSERT INTO album_share_links (token, album_id, allow_download, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            link.token,
            link.album_id,
            link.allow_download,
            link.expires_at,
            link.created_at
        ],
    )?;
    Ok(link)
}

pub fn get_album_share_link(
    conn: &rusqlite::Connection,
    token: &str,
) -> rusqlite::Result<Option<AlbumShareLink>> {
    conn.query_row(
        "SELECT token, album_id, allow_download, expires_at, created_at FROM album_share_links WHERE token = ?",
        [token],
        |r| {
            Ok(AlbumShareLink {
                token: r.get(0)?,
                album_id: r.get(1)?,
                allow_download: r.get(2)?,
                expires_at: r.get(3)?,
                created_at: r.get(4)?,
            })
        },
    )
    .optional()
}

pub fn delete_album_share_link(conn: &rusqlite::Connection, token: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM album_share_links WHERE token = ?", [token])?;
    Ok(())
}

pub fn get_album_share_links_for_album(
    conn: &rusqlite::Connection,
    album_id: &str,
) -> rusqlite::Result<Vec<AlbumShareLink>> {
    let mut stmt = conn.prepare(
        "SELECT token, album_id, allow_download, expires_at, created_at FROM album_share_links
         WHERE album_id = ? ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map([album_id], |r| {
            Ok(AlbumShareLink {
                token: r.get(0)?,
                album_id: r.get(1)?,
                allow_download: r.get(2)?,
                expires_at: r.get(3)?,
                created_at: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

// ── API keys ─────────────────────────────────────────────────────────────────

pub fn create_api_key(
    conn: &rusqlite::Connection,
    name: &str,
    permission: &str,
) -> rusqlite::Result<ApiKey> {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    let key = hex::encode(bytes);
    let record = ApiKey {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        key,
        permission: permission.to_string(),
        created_at: now_iso(),
        last_used_at: None,
    };
    conn.execute(
        "INSERT INTO api_keys (id, name, key, permission, created_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            record.id,
            record.name,
            record.key,
            record.permission,
            record.created_at,
            record.last_used_at
        ],
    )?;
    Ok(record)
}

pub fn list_api_keys(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<serde_json::Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, permission, created_at, last_used_at FROM api_keys ORDER BY created_at ASC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "permission": r.get::<_, String>(2)?,
                "created_at": r.get::<_, String>(3)?,
                "last_used_at": r.get::<_, Option<String>>(4)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_api_key_by_value(
    conn: &rusqlite::Connection,
    key: &str,
) -> rusqlite::Result<Option<ApiKey>> {
    conn.query_row(
        "SELECT id, name, key, permission, created_at, last_used_at FROM api_keys WHERE key = ?",
        [key],
        |r| {
            Ok(ApiKey {
                id: r.get(0)?,
                name: r.get(1)?,
                key: r.get(2)?,
                permission: r.get(3)?,
                created_at: r.get(4)?,
                last_used_at: r.get(5)?,
            })
        },
    )
    .optional()
}

pub fn delete_api_key(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM api_keys WHERE id = ?", [id])?;
    Ok(())
}

pub fn touch_api_key_last_used(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?",
        [id],
    )?;
    Ok(())
}

pub fn is_share_expired(expires_at: &Option<String>) -> bool {
    let Some(exp) = expires_at else {
        return false;
    };
    chrono::DateTime::parse_from_rfc3339(exp)
        .map(|dt| dt < chrono::Utc::now())
        .unwrap_or_else(|_| {
            // SQLite-style or ISO without timezone
            chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%dT%H:%M:%S%.fZ")
                .or_else(|_| chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%d %H:%M:%S"))
                .map(|ndt| ndt.and_utc() < chrono::Utc::now())
                .unwrap_or(false)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn schema_roundtrip_and_settings() {
        let dir = tempdir().unwrap();
        let config = crate::config::Config {
            data_dir: dir.path().to_path_buf(),
            bind: "127.0.0.1:0".into(),
            log_level: "error".into(),
            static_dir: PathBuf::from("frontend/dist"),
            oidc_issuer: None,
            oidc_client_id: None,
            oidc_client_secret: None,
            auth_secret: None,
            auth_url: None,
            legacy_api_key: None,
        };
        let db = Db::open(&config).unwrap();
        db.with_conn(|c| {
            let item = insert_queue_item(c, "https://example.com/v", "ytdlp").unwrap();
            assert_eq!(item.status, "pending");
            let media = insert_media_item(
                c,
                NewMedia {
                    queue_item_id: Some(&item.id),
                    url: "https://example.com/v",
                    media_type: "video",
                    title: Some("t"),
                    description: None,
                    uploader: None,
                    duration: Some(1.0),
                    thumbnail_path: None,
                    file_path: "/tmp/x.mp4",
                    file_size: Some(10),
                    format: Some("mp4"),
                    width: Some(1),
                    height: Some(1),
                    raw_metadata: None,
                    album_id: None,
                    include_in_random: 0,
                },
            )
            .unwrap();
            let tag = upsert_tag(c, "platform:youtube").unwrap();
            add_tag_to_media(c, &media.id, &tag.id).unwrap();
            let with_tags = get_media_item_with_tags(c, &media.id).unwrap().unwrap();
            assert_eq!(with_tags.tags.len(), 1);
            let key = create_api_key(c, "test", "read_write").unwrap();
            assert_eq!(key.key.len(), 32);
            assert!(get_setting(c, "download_path").is_some());
            assert!(get_setting(c, "random_mode").as_deref() == Some("flag"));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn opens_existing_v1_shaped_db() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("memevaultproject.db");
        // Simulate a pre-existing V1 database file
        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO settings (key, value) VALUES ('download_path', '/tmp/media');
                 INSERT INTO settings (key, value) VALUES ('random_mode', 'flag');
                 CREATE TABLE queue_items (
                   id TEXT PRIMARY KEY, url TEXT NOT NULL, downloader TEXT NOT NULL DEFAULT 'ytdlp',
                   status TEXT NOT NULL DEFAULT 'pending', progress REAL NOT NULL DEFAULT 0,
                   error TEXT, created_at TEXT NOT NULL, completed_at TEXT);
                 CREATE TABLE media (
                   id TEXT PRIMARY KEY, queue_item_id TEXT, url TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'video',
                   title TEXT, description TEXT, uploader TEXT, duration REAL, thumbnail_path TEXT,
                   file_path TEXT NOT NULL, file_size INTEGER, format TEXT, width INTEGER, height INTEGER,
                   created_at TEXT NOT NULL, raw_metadata TEXT, album_id TEXT, include_in_random INTEGER NOT NULL DEFAULT 0);
                 CREATE TABLE albums (id TEXT PRIMARY KEY, queue_item_id TEXT, url TEXT NOT NULL, title TEXT, uploader TEXT, created_at TEXT NOT NULL);
                 CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
                 CREATE TABLE media_tags (media_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (media_id, tag_id));
                 CREATE TABLE share_links (token TEXT PRIMARY KEY, media_id TEXT NOT NULL, allow_download INTEGER NOT NULL DEFAULT 1, expires_at TEXT, created_at TEXT NOT NULL);
                 CREATE TABLE album_share_links (token TEXT PRIMARY KEY, album_id TEXT NOT NULL, allow_download INTEGER NOT NULL DEFAULT 1, expires_at TEXT, created_at TEXT NOT NULL);
                 CREATE TABLE api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE, permission TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT);
                 INSERT INTO media (id, url, type, file_path, created_at, include_in_random)
                   VALUES ('m1', 'https://x', 'image', '/tmp/a.jpg', '2020-01-01T00:00:00.000Z', 0);",
            )
            .unwrap();
        }
        let config = crate::config::Config {
            data_dir: dir.path().to_path_buf(),
            bind: "127.0.0.1:0".into(),
            log_level: "error".into(),
            static_dir: PathBuf::from("frontend/dist"),
            oidc_issuer: None,
            oidc_client_id: None,
            oidc_client_secret: None,
            auth_secret: None,
            auth_url: None,
            legacy_api_key: None,
        };
        let db = Db::open(&config).unwrap();
        db.with_conn(|c| {
            let items = list_media_items_with_tags(c).unwrap();
            assert_eq!(items.len(), 1);
            assert_eq!(items[0].media.id, "m1");
            Ok(())
        })
        .unwrap();
    }
}
