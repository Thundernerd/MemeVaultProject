import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedMediaItem } from '../helpers/db';
import {
  createShareLink,
  getShareLink,
  deleteShareLink,
  getShareLinksForMedia,
  listSharedMediaWithTags,
  insertMediaItem,
} from '@/lib/db';

beforeEach(resetDb);

describe('createShareLink / getShareLink', () => {
  it('creates a share link and retrieves it by token', () => {
    const media = seedMediaItem();
    const link = createShareLink(media.id, true, null);
    const got = getShareLink(link.token);
    expect(got).toBeDefined();
    expect(got!.media_id).toBe(media.id);
    expect(got!.allow_download).toBe(1);
    expect(got!.expires_at).toBeNull();
  });

  it('stores allow_download = 0 when false', () => {
    const media = seedMediaItem();
    const link = createShareLink(media.id, false, null);
    expect(getShareLink(link.token)!.allow_download).toBe(0);
  });

  it('stores a non-null expires_at', () => {
    const media = seedMediaItem();
    const expiry = '2099-01-01T00:00:00.000Z';
    const link = createShareLink(media.id, true, expiry);
    expect(getShareLink(link.token)!.expires_at).toBe(expiry);
  });

  it('returns undefined for an unknown token', () => {
    expect(getShareLink('no-such-token')).toBeUndefined();
  });

  it('tokens are unique per link', () => {
    const media = seedMediaItem();
    const a = createShareLink(media.id, true, null);
    const b = createShareLink(media.id, true, null);
    expect(a.token).not.toBe(b.token);
  });
});

describe('deleteShareLink', () => {
  it('removes the link', () => {
    const media = seedMediaItem();
    const link = createShareLink(media.id, true, null);
    deleteShareLink(link.token);
    expect(getShareLink(link.token)).toBeUndefined();
  });
});

describe('getShareLinksForMedia', () => {
  it('returns all links for a media item', () => {
    const media = seedMediaItem();
    createShareLink(media.id, true, null);
    createShareLink(media.id, false, null);
    const links = getShareLinksForMedia(media.id);
    expect(links).toHaveLength(2);
  });

  it('returns empty array for media with no links', () => {
    const media = seedMediaItem();
    expect(getShareLinksForMedia(media.id)).toEqual([]);
  });

  it('returns only links belonging to the requested media', () => {
    const a = seedMediaItem();
    const b = insertMediaItem({
      queue_item_id: null, url: 'https://other.com', type: 'image',
      title: null, description: null, uploader: null, duration: null,
      thumbnail_path: null, file_path: '/tmp/other.jpg', file_size: 1,
      format: 'jpg', width: null, height: null, raw_metadata: null, album_id: null,
    });
    createShareLink(a.id, true, null);
    const links = getShareLinksForMedia(b.id);
    expect(links).toHaveLength(0);
  });
});

describe('listSharedMediaWithTags', () => {
  it('returns media with an active (non-expired) share link', () => {
    const media = seedMediaItem();
    createShareLink(media.id, true, null); // no expiry = never expires
    const list = listSharedMediaWithTags();
    expect(list.map((m) => m.id)).toContain(media.id);
  });

  it('excludes media with only expired share links', () => {
    const media = seedMediaItem();
    createShareLink(media.id, true, '2000-01-01T00:00:00Z'); // expired
    const list = listSharedMediaWithTags();
    expect(list.map((m) => m.id)).not.toContain(media.id);
  });

  it('includes media when it has at least one active link even if another expired', () => {
    const media = seedMediaItem();
    createShareLink(media.id, true, '2000-01-01T00:00:00Z'); // expired
    createShareLink(media.id, true, null); // active
    const list = listSharedMediaWithTags();
    expect(list.map((m) => m.id)).toContain(media.id);
  });

  it('returns empty when no links exist', () => {
    seedMediaItem();
    expect(listSharedMediaWithTags()).toEqual([]);
  });
});
