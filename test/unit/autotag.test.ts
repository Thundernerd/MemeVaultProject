import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the db module before autotag imports it
vi.mock('@/lib/db', () => ({
  upsertTag: vi.fn((name: string) => ({ id: 'tag-' + name, name, created_at: '' })),
  addTagToMedia: vi.fn(),
}));

import { autoTagMedia } from '@/lib/autotag';
import { upsertTag, addTagToMedia } from '@/lib/db';

const upsertTagMock = vi.mocked(upsertTag);
const addTagToMediaMock = vi.mocked(addTagToMedia);

function run(overrides: Partial<Parameters<typeof autoTagMedia>[0]> = {}) {
  autoTagMedia({
    mediaId: 'media-1',
    url: 'https://www.youtube.com/watch?v=abc',
    type: 'video',
    createdAt: '2024-06-15T12:00:00Z',
    ...overrides,
  });
}

function upsertedNames(): string[] {
  return upsertTagMock.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('autoTagMedia — type tag', () => {
  it('adds type:video for video', () => {
    run({ type: 'video' });
    expect(upsertedNames()).toContain('type:video');
  });

  it('adds type:image for image', () => {
    run({ type: 'image' });
    expect(upsertedNames()).toContain('type:image');
  });
});

describe('autoTagMedia — platform tag', () => {
  it('extracts platform from youtube.com', () => {
    run({ url: 'https://www.youtube.com/watch?v=abc' });
    expect(upsertedNames()).toContain('platform:youtube');
  });

  it('maps youtu.be alias to platform:youtube', () => {
    run({ url: 'https://youtu.be/abc123' });
    expect(upsertedNames()).toContain('platform:youtube');
  });

  it('maps twitter.com alias to platform:x', () => {
    run({ url: 'https://twitter.com/user/status/123' });
    expect(upsertedNames()).toContain('platform:x');
  });

  it('uses hostname label for unknown platforms', () => {
    run({ url: 'https://vimeo.com/123456' });
    expect(upsertedNames()).toContain('platform:vimeo');
  });

  it('strips www. prefix', () => {
    run({ url: 'https://www.reddit.com/r/test' });
    expect(upsertedNames()).toContain('platform:reddit');
  });

  it('does not add platform tag for invalid URL', () => {
    run({ url: 'not-a-url' });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('platform:'))).toBe(false);
  });
});

describe('autoTagMedia — uploader tag', () => {
  it('adds uploader tag when uploader is present', () => {
    run({ uploader: 'SomeChannel' });
    expect(upsertedNames()).toContain('uploader:somechannel');
  });

  it('lowercases the uploader name', () => {
    run({ uploader: 'MyUser' });
    expect(upsertedNames()).toContain('uploader:myuser');
  });

  it('trims whitespace from uploader', () => {
    run({ uploader: '  creator  ' });
    expect(upsertedNames()).toContain('uploader:creator');
  });

  it('skips uploader tag when null', () => {
    run({ uploader: null });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('uploader:'))).toBe(false);
  });

  it('skips uploader tag when empty string', () => {
    run({ uploader: '' });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('uploader:'))).toBe(false);
  });

  it('skips uploader tag when name exceeds 64 characters', () => {
    run({ uploader: 'a'.repeat(65) });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('uploader:'))).toBe(false);
  });

  it('includes uploader tag when name is exactly 64 characters', () => {
    run({ uploader: 'a'.repeat(64) });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('uploader:'))).toBe(true);
  });
});

describe('autoTagMedia — date tag', () => {
  it('adds date tag for a valid ISO timestamp', () => {
    run({ createdAt: '2024-06-15T12:00:00Z' });
    expect(upsertedNames()).toContain('date:2024');
  });

  it('skips date tag for invalid date string', () => {
    run({ createdAt: 'not-a-date' });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('date:'))).toBe(false);
  });
});

describe('autoTagMedia — format tag', () => {
  it('adds format tag when format is present', () => {
    run({ format: 'mp4' });
    expect(upsertedNames()).toContain('format:mp4');
  });

  it('lowercases format', () => {
    run({ format: 'WEBM' });
    expect(upsertedNames()).toContain('format:webm');
  });

  it('skips format tag when null', () => {
    run({ format: null });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('format:'))).toBe(false);
  });

  it('skips format tag when longer than 10 characters', () => {
    run({ format: 'a'.repeat(11) });
    const names = upsertedNames();
    expect(names.some((n) => n.startsWith('format:'))).toBe(false);
  });
});

describe('autoTagMedia — db integration', () => {
  it('calls addTagToMedia for each upserted tag', () => {
    run({ type: 'video', uploader: 'creator', format: 'mp4' });
    // type + platform + uploader + date + format = 5 tags
    expect(addTagToMediaMock).toHaveBeenCalledTimes(upsertTagMock.mock.calls.length);
  });

  it('passes the correct mediaId to addTagToMedia', () => {
    run({ mediaId: 'media-xyz' } as Parameters<typeof autoTagMedia>[0]);
    for (const call of addTagToMediaMock.mock.calls) {
      expect(call[0]).toBe('media-xyz');
    }
  });

  it('never throws even when upsertTag throws', () => {
    upsertTagMock.mockImplementationOnce(() => { throw new Error('DB error'); });
    expect(() => run()).not.toThrow();
  });

  it('never throws even when addTagToMedia throws', () => {
    addTagToMediaMock.mockImplementationOnce(() => { throw new Error('DB error'); });
    expect(() => run()).not.toThrow();
  });
});
