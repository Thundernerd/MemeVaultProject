import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedMediaItem } from '../helpers/db';
import {
  insertMediaItem,
  getMediaItem,
  listMediaItems,
  listMediaItemsWithTags,
  getMediaItemWithTags,
  deleteMediaItem,
  getMediaByQueueItem,
  setMediaRandomFlag,
  listRandomCandidatesWithTags,
  insertQueueItem,
  upsertTag,
  addTagToMedia,
  insertAlbum,
  listAllTags,
} from '@/lib/db';

beforeEach(resetDb);

const BASE = {
  queue_item_id: null as string | null,
  url: 'https://example.com/video',
  type: 'video' as const,
  title: 'Test Video',
  description: 'A test description',
  uploader: 'TestUser',
  duration: 120,
  thumbnail_path: null as string | null,
  file_path: '/tmp/test.mp4',
  file_size: 2048,
  format: 'mp4',
  width: 1920,
  height: 1080,
  raw_metadata: null as string | null,
  album_id: null as string | null,
};

describe('insertMediaItem / getMediaItem', () => {
  it('inserts and retrieves a media item', () => {
    const item = insertMediaItem(BASE);
    const got = getMediaItem(item.id);
    expect(got).toBeDefined();
    expect(got!.url).toBe(BASE.url);
    expect(got!.type).toBe('video');
    expect(got!.title).toBe('Test Video');
  });

  it('assigns a unique id', () => {
    const a = insertMediaItem(BASE);
    const b = insertMediaItem({ ...BASE, url: 'https://other.com' });
    expect(a.id).not.toBe(b.id);
  });

  it('defaults include_in_random to 0', () => {
    const item = insertMediaItem(BASE);
    expect(item.include_in_random).toBe(0);
  });

  it('returns undefined for unknown id', () => {
    expect(getMediaItem('does-not-exist')).toBeUndefined();
  });
});

describe('listMediaItems', () => {
  it('returns all items when multiple exist', () => {
    insertMediaItem(BASE);
    insertMediaItem({ ...BASE, url: 'https://second.com' });
    expect(listMediaItems()).toHaveLength(2);
  });

  it('returns empty when no items', () => {
    expect(listMediaItems()).toEqual([]);
  });
});

describe('listMediaItemsWithTags', () => {
  it('returns media items with empty tags array when no tags', () => {
    insertMediaItem(BASE);
    const list = listMediaItemsWithTags();
    expect(list.length).toBe(1);
    expect(list[0].tags).toEqual([]);
  });

  it('returns media with attached tags', () => {
    const item = insertMediaItem(BASE);
    const tag = upsertTag('platform:youtube');
    addTagToMedia(item.id, tag.id);

    const list = listMediaItemsWithTags();
    expect(list[0].tags.map((t) => t.name)).toContain('platform:youtube');
  });

  it('excludes album media (album_id is not null)', () => {
    // Album media should not appear in the main vault listing
    const album = insertAlbum({ queue_item_id: null, url: 'https://example.com/album', title: 'Album', uploader: null });
    insertMediaItem({ ...BASE, album_id: album.id });
    const list = listMediaItemsWithTags();
    expect(list.length).toBe(0);
  });
});

describe('getMediaItemWithTags', () => {
  it('returns undefined for unknown id', () => {
    expect(getMediaItemWithTags('nope')).toBeUndefined();
  });

  it('returns item with tags', () => {
    const item = insertMediaItem(BASE);
    const tag = upsertTag('type:video');
    addTagToMedia(item.id, tag.id);
    const result = getMediaItemWithTags(item.id);
    expect(result).toBeDefined();
    expect(result!.tags.map((t) => t.name)).toContain('type:video');
  });
});

describe('deleteMediaItem', () => {
  it('removes the item and returns it', () => {
    const item = insertMediaItem(BASE);
    const deleted = deleteMediaItem(item.id);
    expect(deleted).toBeDefined();
    expect(getMediaItem(item.id)).toBeUndefined();
  });

  it('returns undefined for non-existent id', () => {
    expect(deleteMediaItem('ghost')).toBeUndefined();
  });

  it('cascades deletion to media_tags', () => {
    const item = insertMediaItem(BASE);
    const tag = upsertTag('type:video');
    addTagToMedia(item.id, tag.id);
    deleteMediaItem(item.id);
    // Tag itself should still exist, just the junction row removed
    const tags = listAllTags();
    expect(tags.find((t: { name: string }) => t.name === 'type:video')?.usage_count).toBe(0);
  });
});

describe('getMediaByQueueItem', () => {
  it('returns media items linked to a queue item', () => {
    const q = insertQueueItem('https://example.com', 'ytdlp');
    insertMediaItem({ ...BASE, queue_item_id: q.id });
    const results = getMediaByQueueItem(q.id);
    expect(results.length).toBe(1);
    expect(results[0].queue_item_id).toBe(q.id);
  });

  it('returns empty array for unknown queue item', () => {
    expect(getMediaByQueueItem('unknown')).toEqual([]);
  });
});

describe('setMediaRandomFlag / listRandomCandidatesWithTags', () => {
  it('includes item when flag is set to true', () => {
    const item = insertMediaItem(BASE);
    setMediaRandomFlag(item.id, true);
    const candidates = listRandomCandidatesWithTags();
    expect(candidates.map((c) => c.id)).toContain(item.id);
  });

  it('excludes item when flag is false', () => {
    const item = insertMediaItem(BASE);
    setMediaRandomFlag(item.id, false);
    const candidates = listRandomCandidatesWithTags();
    expect(candidates.map((c) => c.id)).not.toContain(item.id);
  });

  it('returns empty when no items are flagged', () => {
    seedMediaItem();
    expect(listRandomCandidatesWithTags()).toEqual([]);
  });
});
