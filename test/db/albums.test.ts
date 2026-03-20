import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedMediaItem } from '../helpers/db';
import {
  insertAlbum,
  listAlbumsWithMedia,
  getAlbumWithMedia,
  deleteAlbum,
  insertMediaItem,
  listMediaItems,
} from '@/lib/db';

beforeEach(resetDb);

const ALBUM_BASE = {
  queue_item_id: null as string | null,
  url: 'https://example.com/album',
  title: 'My Album',
  uploader: 'Creator',
};

describe('insertAlbum / getAlbumWithMedia', () => {
  it('creates an album and retrieves it', () => {
    const album = insertAlbum(ALBUM_BASE);
    const got = getAlbumWithMedia(album.id);
    expect(got).toBeDefined();
    expect(got!.title).toBe('My Album');
    expect(got!.media).toEqual([]);
  });

  it('assigns a unique id', () => {
    const a = insertAlbum(ALBUM_BASE);
    const b = insertAlbum({ ...ALBUM_BASE, url: 'https://example.com/album2' });
    expect(a.id).not.toBe(b.id);
  });

  it('returns undefined for unknown id', () => {
    expect(getAlbumWithMedia('ghost')).toBeUndefined();
  });
});

describe('listAlbumsWithMedia', () => {
  it('returns empty array when no albums', () => {
    expect(listAlbumsWithMedia()).toEqual([]);
  });

  it('includes media items linked to the album', () => {
    const album = insertAlbum(ALBUM_BASE);
    insertMediaItem({
      queue_item_id: null,
      url: 'https://example.com/img1',
      type: 'image',
      title: 'Image 1',
      description: null,
      uploader: null,
      duration: null,
      thumbnail_path: null,
      file_path: '/tmp/img1.jpg',
      file_size: 512,
      format: 'jpg',
      width: 800,
      height: 600,
      raw_metadata: null,
      album_id: album.id,
    });
    const list = listAlbumsWithMedia();
    expect(list).toHaveLength(1);
    expect(list[0].media).toHaveLength(1);
    expect(list[0].media[0].url).toBe('https://example.com/img1');
  });

  it('returns multiple albums', () => {
    insertAlbum(ALBUM_BASE);
    insertAlbum({ ...ALBUM_BASE, url: 'https://example.com/b' });
    expect(listAlbumsWithMedia()).toHaveLength(2);
  });
});

describe('deleteAlbum', () => {
  it('removes the album and its media', () => {
    const album = insertAlbum(ALBUM_BASE);
    insertMediaItem({
      queue_item_id: null,
      url: 'https://example.com/img',
      type: 'image',
      title: null,
      description: null,
      uploader: null,
      duration: null,
      thumbnail_path: null,
      file_path: '/tmp/img.jpg',
      file_size: 512,
      format: 'jpg',
      width: 800,
      height: 600,
      raw_metadata: null,
      album_id: album.id,
    });

    const deleted = deleteAlbum(album.id);
    expect(deleted).toBeDefined();
    expect(getAlbumWithMedia(album.id)).toBeUndefined();
    // Album media should also be gone
    const remaining = listAlbumsWithMedia();
    expect(remaining).toHaveLength(0);
  });

  it('returns undefined for a non-existent album', () => {
    expect(deleteAlbum('ghost')).toBeUndefined();
  });

  it('does not affect unrelated standalone media', () => {
    insertAlbum(ALBUM_BASE);
    seedMediaItem(); // standalone, not in any album
    deleteAlbum((listAlbumsWithMedia()[0]).id);
    // seedMediaItem created standalone media which should be unaffected
    expect(listMediaItems()).toHaveLength(1);
  });
});
