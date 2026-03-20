import { getDb, insertMediaItem as _insertMediaItem } from '@/lib/db';
import type { MediaType } from '@/lib/db';

/**
 * Clears all data tables between tests. Does NOT touch the settings table
 * because seedDefaultSettings() only runs once at schema init time.
 * Foreign keys are disabled during the wipe so order doesn't matter.
 */
export function resetDb(): void {
  const db = getDb();
  db.pragma('foreign_keys = OFF');
  for (const table of [
    'media_tags',
    'share_links',
    'media',
    'albums',
    'queue_items',
    'api_keys',
    'tags',
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.pragma('foreign_keys = ON');
}

/** Minimal media item factory for use in tests that need a pre-existing media row. */
export function seedMediaItem(overrides: Record<string, unknown> = {}) {
  return _insertMediaItem({
    queue_item_id: null,
    url: 'https://example.com/video',
    type: 'video' as MediaType,
    title: 'Test Video',
    description: null,
    uploader: null,
    duration: null,
    thumbnail_path: null,
    file_path: '/tmp/test.mp4',
    file_size: 1024,
    format: 'mp4',
    width: 1920,
    height: 1080,
    raw_metadata: null,
    album_id: null,
    ...overrides,
  } as Parameters<typeof _insertMediaItem>[0]);
}
