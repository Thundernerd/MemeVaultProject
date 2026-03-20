import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedMediaItem } from '../helpers/db';
import {
  upsertTag,
  listAllTags,
  deleteTag,
  addTagToMedia,
  removeTagFromMedia,
  getTagsForMedia,
  setTagsForMedia,
} from '@/lib/db';

beforeEach(resetDb);

describe('upsertTag', () => {
  it('creates a new tag', () => {
    const tag = upsertTag('platform:youtube');
    expect(tag.name).toBe('platform:youtube');
    expect(tag.id).toBeDefined();
  });

  it('is idempotent — returns existing tag on second call', () => {
    const a = upsertTag('type:video');
    const b = upsertTag('type:video');
    expect(a.id).toBe(b.id);
  });

  it('is case-insensitive — TAG and tag share the same row', () => {
    const lower = upsertTag('mytag');
    const upper = upsertTag('MYTAG');
    expect(lower.id).toBe(upper.id);
  });

  it('trims whitespace from the name', () => {
    const tag = upsertTag('  trimmed  ');
    expect(tag.name).toBe('trimmed');
  });
});

describe('listAllTags', () => {
  it('returns empty array when no tags', () => {
    expect(listAllTags()).toEqual([]);
  });

  it('includes usage_count', () => {
    upsertTag('type:video');
    const list = listAllTags();
    expect(list[0]).toHaveProperty('usage_count');
  });

  it('counts usage correctly', () => {
    const media = seedMediaItem();
    const tag = upsertTag('platform:reddit');
    addTagToMedia(media.id, tag.id);
    const list = listAllTags();
    const found = list.find((t) => t.name === 'platform:reddit');
    expect(found?.usage_count).toBe(1);
  });

  it('orders tags alphabetically by name', () => {
    upsertTag('zzz');
    upsertTag('aaa');
    const list = listAllTags();
    const names = list.map((t) => t.name);
    expect(names.indexOf('aaa')).toBeLessThan(names.indexOf('zzz'));
  });
});

describe('deleteTag', () => {
  it('removes a tag', () => {
    const tag = upsertTag('to-delete');
    deleteTag(tag.id);
    expect(listAllTags().find((t) => t.id === tag.id)).toBeUndefined();
  });
});

describe('addTagToMedia / removeTagFromMedia / getTagsForMedia', () => {
  it('attaches a tag to a media item', () => {
    const media = seedMediaItem();
    const tag = upsertTag('type:image');
    addTagToMedia(media.id, tag.id);
    const tags = getTagsForMedia(media.id);
    expect(tags.map((t) => t.name)).toContain('type:image');
  });

  it('is idempotent — adding the same tag twice does not error or duplicate', () => {
    const media = seedMediaItem();
    const tag = upsertTag('dup');
    addTagToMedia(media.id, tag.id);
    addTagToMedia(media.id, tag.id);
    expect(getTagsForMedia(media.id)).toHaveLength(1);
  });

  it('removes a tag from a media item', () => {
    const media = seedMediaItem();
    const tag = upsertTag('removable');
    addTagToMedia(media.id, tag.id);
    removeTagFromMedia(media.id, tag.id);
    expect(getTagsForMedia(media.id)).toHaveLength(0);
  });

  it('returns tags ordered alphabetically', () => {
    const media = seedMediaItem();
    const b = upsertTag('bbb');
    const a = upsertTag('aaa');
    addTagToMedia(media.id, b.id);
    addTagToMedia(media.id, a.id);
    const names = getTagsForMedia(media.id).map((t) => t.name);
    expect(names[0]).toBe('aaa');
    expect(names[1]).toBe('bbb');
  });
});

describe('setTagsForMedia', () => {
  it('replaces all existing tags', () => {
    const media = seedMediaItem();
    upsertTag('old-tag');
    addTagToMedia(media.id, upsertTag('old-tag').id);
    setTagsForMedia(media.id, ['new-tag']);
    const names = getTagsForMedia(media.id).map((t) => t.name);
    expect(names).toContain('new-tag');
    expect(names).not.toContain('old-tag');
  });

  it('clears all tags when given empty array', () => {
    const media = seedMediaItem();
    addTagToMedia(media.id, upsertTag('some-tag').id);
    setTagsForMedia(media.id, []);
    expect(getTagsForMedia(media.id)).toHaveLength(0);
  });

  it('skips blank entries in the names array', () => {
    const media = seedMediaItem();
    setTagsForMedia(media.id, ['', '  ', 'valid-tag']);
    const names = getTagsForMedia(media.id).map((t) => t.name);
    expect(names).toEqual(['valid-tag']);
  });

  it('returns the resulting tag list', () => {
    const media = seedMediaItem();
    const result = setTagsForMedia(media.id, ['alpha', 'beta']);
    expect(result.map((t) => t.name)).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });
});
