import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  hasReadAccess: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  getSetting: vi.fn(),
  listRandomCandidatesWithTags: vi.fn(),
  listSharedMediaWithTags: vi.fn(),
}));

import { GET } from '@/app/api/v1/random/route';
import { hasReadAccess } from '@/lib/auth';
import { getSetting, listRandomCandidatesWithTags, listSharedMediaWithTags } from '@/lib/db';
import { makeReq, json } from './helpers';

const readMock = vi.mocked(hasReadAccess);
const getSettingMock = vi.mocked(getSetting);
const flaggedMock = vi.mocked(listRandomCandidatesWithTags);
const sharedMock = vi.mocked(listSharedMediaWithTags);

const MEDIA_ITEM = {
  id: 'media-1',
  url: 'https://example.com/video',
  type: 'video' as const,
  title: 'Funny meme',
  description: null,
  uploader: 'creator',
  duration: 30,
  file_size: 1024,
  format: 'mp4',
  width: 1920,
  height: 1080,
  created_at: '2024-01-01T00:00:00Z',
  tags: [{ id: 't1', name: 'type:video', created_at: '' }],
  // extra MediaItem fields
  queue_item_id: null,
  thumbnail_path: null,
  file_path: '/tmp/video.mp4',
  raw_metadata: null,
  album_id: null,
  include_in_random: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  readMock.mockReturnValue(true);
  getSettingMock.mockReturnValue('flag');
  flaggedMock.mockReturnValue([MEDIA_ITEM]);
  sharedMock.mockReturnValue([]);
});

describe('GET /api/v1/random', () => {
  it('returns 200 with a media item', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/random'));
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body.id).toBe('media-1');
    expect(body.type).toBe('video');
  });

  it('includes tags as an array of names', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/random'));
    const body = await json(res) as { tags: string[] };
    expect(body.tags).toEqual(['type:video']);
  });

  it('includes download_url pointing to the download endpoint', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/random'));
    const body = await json(res) as { download_url: string };
    expect(body.download_url).toBe('/api/v1/download/media-1');
  });

  it('uses listRandomCandidatesWithTags when mode is flag', async () => {
    getSettingMock.mockReturnValue('flag');
    await GET(makeReq('http://localhost/api/v1/random'));
    expect(flaggedMock).toHaveBeenCalled();
    expect(sharedMock).not.toHaveBeenCalled();
  });

  it('uses listSharedMediaWithTags when mode is shared', async () => {
    getSettingMock.mockReturnValue('shared');
    sharedMock.mockReturnValue([MEDIA_ITEM]);
    await GET(makeReq('http://localhost/api/v1/random'));
    expect(sharedMock).toHaveBeenCalled();
    expect(flaggedMock).not.toHaveBeenCalled();
  });

  it('defaults to flag mode when setting is undefined', async () => {
    getSettingMock.mockReturnValue(undefined);
    await GET(makeReq('http://localhost/api/v1/random'));
    expect(flaggedMock).toHaveBeenCalled();
  });

  it('returns 404 when no candidates available', async () => {
    flaggedMock.mockReturnValue([]);
    const res = await GET(makeReq('http://localhost/api/v1/random'));
    expect(res.status).toBe(404);
  });

  it('returns 401 when no read access', async () => {
    readMock.mockReturnValue(false);
    const res = await GET(makeReq('http://localhost/api/v1/random'));
    expect(res.status).toBe(401);
  });
});
