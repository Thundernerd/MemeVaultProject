import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  hasWriteAccess: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  insertQueueItem: vi.fn(),
}));

import { POST } from '@/app/api/v1/submit/route';
import { hasWriteAccess } from '@/lib/auth';
import { insertQueueItem } from '@/lib/db';
import { makeReq, json } from './helpers';

const writeMock = vi.mocked(hasWriteAccess);
const insertMock = vi.mocked(insertQueueItem);

beforeEach(() => {
  vi.clearAllMocks();
  writeMock.mockReturnValue(true);
  insertMock.mockReturnValue({
    id: 'new-queue-id',
    url: 'https://example.com',
    downloader: 'ytdlp',
    status: 'pending',
    progress: 0,
    error: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  });
});

describe('POST /api/v1/submit', () => {
  it('returns 201 with queue id for a valid video request', async () => {
    const res = await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { url: 'https://youtube.com/watch?v=abc', type: 'video' },
    }));
    expect(res.status).toBe(201);
    const body = await json(res) as { id: string };
    expect(body.id).toBe('new-queue-id');
  });

  it('maps type=image to gallery-dl downloader', async () => {
    await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { url: 'https://reddit.com/r/pics', type: 'image' },
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.any(String), 'gallery-dl');
  });

  it('maps type=video to ytdlp downloader', async () => {
    await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { url: 'https://youtube.com/watch?v=abc', type: 'video' },
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.any(String), 'ytdlp');
  });

  it('trims whitespace from url', async () => {
    await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { url: '  https://example.com  ', type: 'video' },
    }));
    expect(insertMock).toHaveBeenCalledWith('https://example.com', 'ytdlp');
  });

  it('returns 401 when no write access', async () => {
    writeMock.mockReturnValue(false);
    const res = await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { url: 'https://example.com', type: 'video' },
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing url', async () => {
    const res = await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { type: 'video' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const res = await POST(makeReq('http://localhost/api/v1/submit', {
      method: 'POST',
      body: { url: 'https://example.com', type: 'audio' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = new (await import('next/server')).NextRequest(
      'http://localhost/api/v1/submit',
      { method: 'POST', body: 'not-json', headers: { 'content-type': 'application/json' } },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
