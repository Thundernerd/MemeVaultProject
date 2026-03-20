import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  hasReadAccess: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  getQueueItem: vi.fn(),
  getMediaByQueueItem: vi.fn(),
}));

import { GET } from '@/app/api/v1/status/[id]/route';
import { hasReadAccess } from '@/lib/auth';
import { getQueueItem, getMediaByQueueItem } from '@/lib/db';
import { makeReq, json } from './helpers';

const readMock = vi.mocked(hasReadAccess);
const getQueueMock = vi.mocked(getQueueItem);
const getMediaMock = vi.mocked(getMediaByQueueItem);

const QUEUE_ITEM = {
  id: 'q-1',
  url: 'https://example.com',
  downloader: 'ytdlp' as const,
  status: 'completed' as const,
  progress: 100,
  error: null,
  created_at: '2024-01-01T00:00:00Z',
  completed_at: '2024-01-01T00:01:00Z',
};

const MEDIA_ITEMS = [
  { id: 'media-1' },
  { id: 'media-2' },
];

beforeEach(() => {
  vi.clearAllMocks();
  readMock.mockReturnValue(true);
  getQueueMock.mockReturnValue(QUEUE_ITEM);
  getMediaMock.mockReturnValue(MEDIA_ITEMS as ReturnType<typeof getMediaByQueueItem>);
});

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/status/[id]', () => {
  it('returns 200 with queue item details', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/status/q-1'), makeParams('q-1'));
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body.id).toBe('q-1');
    expect(body.status).toBe('completed');
    expect(body.progress).toBe(100);
  });

  it('includes media_ids array', async () => {
    const res = await GET(makeReq('http://localhost/api/v1/status/q-1'), makeParams('q-1'));
    const body = await json(res) as { media_ids: string[] };
    expect(body.media_ids).toEqual(['media-1', 'media-2']);
  });

  it('returns 401 when no read access', async () => {
    readMock.mockReturnValue(false);
    const res = await GET(makeReq('http://localhost/api/v1/status/q-1'), makeParams('q-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown id', async () => {
    getQueueMock.mockReturnValue(undefined);
    const res = await GET(makeReq('http://localhost/api/v1/status/unknown'), makeParams('unknown'));
    expect(res.status).toBe(404);
  });

  it('returns empty media_ids when no media produced', async () => {
    getMediaMock.mockReturnValue([]);
    const res = await GET(makeReq('http://localhost/api/v1/status/q-1'), makeParams('q-1'));
    const body = await json(res) as { media_ids: string[] };
    expect(body.media_ids).toEqual([]);
  });
});
