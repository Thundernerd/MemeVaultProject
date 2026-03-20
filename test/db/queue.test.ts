import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../helpers/db';
import {
  insertQueueItem,
  getQueueItem,
  listQueueItems,
  updateQueueItem,
  deleteQueueItem,
  getNextPendingItem,
  countActiveDownloads,
} from '@/lib/db';

beforeEach(resetDb);

describe('insertQueueItem / getQueueItem', () => {
  it('creates a queue item with pending status', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    expect(item.status).toBe('pending');
    expect(item.progress).toBe(0);
    expect(item.error).toBeNull();
    expect(item.completed_at).toBeNull();
    expect(item.url).toBe('https://example.com');
    expect(item.downloader).toBe('ytdlp');
  });

  it('assigns a unique id', () => {
    const a = insertQueueItem('https://a.com', 'ytdlp');
    const b = insertQueueItem('https://b.com', 'gallery-dl');
    expect(a.id).not.toBe(b.id);
  });

  it('can be retrieved by id', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    const retrieved = getQueueItem(item.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(item.id);
  });

  it('returns undefined for an unknown id', () => {
    expect(getQueueItem('non-existent')).toBeUndefined();
  });
});

describe('listQueueItems', () => {
  it('returns both items when multiple exist', () => {
    insertQueueItem('https://first.com', 'ytdlp');
    insertQueueItem('https://second.com', 'ytdlp');
    expect(listQueueItems()).toHaveLength(2);
  });

  it('returns empty array when no items', () => {
    expect(listQueueItems()).toEqual([]);
  });
});

describe('updateQueueItem', () => {
  it('updates status to downloading', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, { status: 'downloading' });
    expect(getQueueItem(item.id)!.status).toBe('downloading');
  });

  it('updates progress', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, { progress: 50 });
    expect(getQueueItem(item.id)!.progress).toBe(50);
  });

  it('updates to completed with completed_at', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    const now = new Date().toISOString();
    updateQueueItem(item.id, { status: 'completed', completed_at: now });
    const updated = getQueueItem(item.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.completed_at).toBe(now);
  });

  it('updates to failed with error message', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, { status: 'failed', error: 'Download error' });
    const updated = getQueueItem(item.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.error).toBe('Download error');
  });

  it('is a no-op when fields object is empty', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, {});
    expect(getQueueItem(item.id)!.status).toBe('pending');
  });
});

describe('deleteQueueItem', () => {
  it('removes the item', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    deleteQueueItem(item.id);
    expect(getQueueItem(item.id)).toBeUndefined();
  });
});

describe('getNextPendingItem', () => {
  it('returns oldest pending item first', () => {
    const first = insertQueueItem('https://first.com', 'ytdlp');
    insertQueueItem('https://second.com', 'ytdlp');
    const next = getNextPendingItem();
    expect(next?.id).toBe(first.id);
  });

  it('returns undefined when no pending items', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, { status: 'completed' });
    expect(getNextPendingItem()).toBeUndefined();
  });

  it('skips downloading and completed items', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, { status: 'downloading' });
    expect(getNextPendingItem()).toBeUndefined();
  });
});

describe('countActiveDownloads', () => {
  it('returns 0 with no items', () => {
    expect(countActiveDownloads()).toBe(0);
  });

  it('counts items in downloading status', () => {
    const a = insertQueueItem('https://a.com', 'ytdlp');
    const b = insertQueueItem('https://b.com', 'ytdlp');
    updateQueueItem(a.id, { status: 'downloading' });
    updateQueueItem(b.id, { status: 'downloading' });
    expect(countActiveDownloads()).toBe(2);
  });

  it('ignores pending and completed items', () => {
    const item = insertQueueItem('https://example.com', 'ytdlp');
    updateQueueItem(item.id, { status: 'completed' });
    expect(countActiveDownloads()).toBe(0);
  });
});
