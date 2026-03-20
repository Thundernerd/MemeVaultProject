import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the DB layer used by auth.ts
vi.mock('@/lib/db', () => ({
  getApiKeyByValue: vi.fn(),
  touchApiKeyLastUsed: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { validateApiKey, hasReadAccess, hasWriteAccess } from '@/lib/auth';
import { getApiKeyByValue, touchApiKeyLastUsed } from '@/lib/db';

const getApiKeyMock = vi.mocked(getApiKeyByValue);
const touchMock = vi.mocked(touchApiKeyLastUsed);

function makeReq(key?: string): NextRequest {
  const headers: HeadersInit = {};
  if (key !== undefined) headers['x-api-key'] = key;
  return new NextRequest('http://localhost/', { headers });
}

const READ_KEY = { id: 'key-1', name: 'Read', key: 'readkey', permission: 'read' as const, created_at: '', last_used_at: null };
const RW_KEY = { id: 'key-2', name: 'RW', key: 'rwkey', permission: 'read_write' as const, created_at: '', last_used_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MEMEVAULTPROJECT_API_KEY;
});

describe('validateApiKey', () => {
  it('returns null when no X-API-Key header is present', () => {
    expect(validateApiKey(makeReq())).toBeNull();
  });

  it('returns null for an unrecognised key', () => {
    getApiKeyMock.mockReturnValue(undefined);
    expect(validateApiKey(makeReq('bad-key'))).toBeNull();
  });

  it('returns ApiKeyContext for a valid DB key', () => {
    getApiKeyMock.mockReturnValue(RW_KEY);
    const ctx = validateApiKey(makeReq('rwkey'));
    expect(ctx).toEqual({ id: 'key-2', permission: 'read_write' });
  });

  it('calls touchApiKeyLastUsed on a successful DB hit', () => {
    getApiKeyMock.mockReturnValue(READ_KEY);
    validateApiKey(makeReq('readkey'));
    expect(touchMock).toHaveBeenCalledWith('key-1');
  });

  it('does not call touchApiKeyLastUsed on failure', () => {
    getApiKeyMock.mockReturnValue(undefined);
    validateApiKey(makeReq('bad'));
    expect(touchMock).not.toHaveBeenCalled();
  });

  describe('legacy env var fallback', () => {
    beforeEach(() => {
      getApiKeyMock.mockReturnValue(undefined); // no DB key match
    });

    it('accepts the legacy env key as read_write', () => {
      process.env.MEMEVAULTPROJECT_API_KEY = 'legacy-secret';
      const ctx = validateApiKey(makeReq('legacy-secret'));
      expect(ctx).toEqual({ id: '__env__', permission: 'read_write' });
    });

    it('rejects a key that does not match the env var', () => {
      process.env.MEMEVAULTPROJECT_API_KEY = 'legacy-secret';
      expect(validateApiKey(makeReq('wrong-key'))).toBeNull();
    });

    it('rejects when env var is not set', () => {
      expect(validateApiKey(makeReq('any-key'))).toBeNull();
    });

    it('rejects when provided key has different length (timing-safe path)', () => {
      process.env.MEMEVAULTPROJECT_API_KEY = 'short';
      expect(validateApiKey(makeReq('a-much-longer-key'))).toBeNull();
    });
  });
});

describe('hasReadAccess', () => {
  it('returns true for a valid read key', () => {
    getApiKeyMock.mockReturnValue(READ_KEY);
    expect(hasReadAccess(makeReq('readkey'))).toBe(true);
  });

  it('returns true for a valid read_write key', () => {
    getApiKeyMock.mockReturnValue(RW_KEY);
    expect(hasReadAccess(makeReq('rwkey'))).toBe(true);
  });

  it('returns false when no key provided', () => {
    expect(hasReadAccess(makeReq())).toBe(false);
  });

  it('returns false for an invalid key', () => {
    getApiKeyMock.mockReturnValue(undefined);
    expect(hasReadAccess(makeReq('bad'))).toBe(false);
  });
});

describe('hasWriteAccess', () => {
  it('returns true only for read_write key', () => {
    getApiKeyMock.mockReturnValue(RW_KEY);
    expect(hasWriteAccess(makeReq('rwkey'))).toBe(true);
  });

  it('returns false for a read-only key', () => {
    getApiKeyMock.mockReturnValue(READ_KEY);
    expect(hasWriteAccess(makeReq('readkey'))).toBe(false);
  });

  it('returns false when no key provided', () => {
    expect(hasWriteAccess(makeReq())).toBe(false);
  });
});
