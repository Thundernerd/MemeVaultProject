import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { Readable } from 'stream';

vi.mock('@/lib/auth', () => ({
  hasReadAccess: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  getMediaItem: vi.fn(),
}));

import { GET } from '@/app/api/v1/download/[id]/route';
import { hasReadAccess } from '@/lib/auth';
import { getMediaItem } from '@/lib/db';
import { makeReq } from './helpers';

const readMock = vi.mocked(hasReadAccess);
const getMediaMock = vi.mocked(getMediaItem);

const MEDIA_ITEM = {
  id: 'media-1',
  queue_item_id: null,
  url: 'https://example.com',
  type: 'video' as const,
  title: 'Test',
  description: null,
  uploader: null,
  duration: null,
  thumbnail_path: null,
  file_path: '/data/video.mp4',
  file_size: 18,
  format: 'mp4',
  width: null,
  height: null,
  created_at: new Date().toISOString(),
  raw_metadata: null,
  album_id: null,
  include_in_random: 0,
} as ReturnType<typeof getMediaItem>;

let statSyncSpy: ReturnType<typeof vi.spyOn>;
let createReadStreamSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  readMock.mockReturnValue(true);
  getMediaMock.mockReturnValue(MEDIA_ITEM);

  statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 18 } as fs.Stats);
  createReadStreamSpy = vi
    .spyOn(fs, 'createReadStream')
    .mockReturnValue(Readable.from(['fake']) as unknown as fs.ReadStream);
});

afterEach(() => {
  statSyncSpy.mockRestore();
  createReadStreamSpy.mockRestore();
});

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/download/[id]', () => {
  it('returns 200 with correct Content-Type for .mp4', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/download/media-1'), makeParams('media-1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
  });

  it('sets Content-Disposition attachment header', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/download/media-1'), makeParams('media-1'));
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('video.mp4');
  });

  it('sets Content-Length to the file size', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/download/media-1'), makeParams('media-1'));
    expect(res.headers.get('content-length')).toBe('18');
  });

  it('returns 401 when no read access', async () => {
    readMock.mockReturnValue(false);
    const res = await GET(makeReq('http://localhost/api/v1/download/media-1'), makeParams('media-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown media id', async () => {
    getMediaMock.mockReturnValue(undefined);
    const res = await GET(makeReq('http://localhost/api/v1/download/ghost'), makeParams('ghost'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when file is missing on disk', async () => {
    statSyncSpy.mockImplementation(() => { throw new Error('ENOENT'); });
    const res = await GET(makeReq('http://localhost/api/v1/download/media-1'), makeParams('media-1'));
    expect(res.status).toBe(404);
  });

  it('uses correct MIME type for .webm files', async () => {
    getMediaMock.mockReturnValue({
      ...MEDIA_ITEM,
      file_path: '/data/video.webm',
    } as ReturnType<typeof getMediaItem>);
    const res = await GET(makeReq('http://localhost/api/v1/download/media-1'), makeParams('media-1'));
    expect(res.headers.get('content-type')).toBe('video/webm');
  });
});
