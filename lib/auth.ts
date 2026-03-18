import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getApiKeyByValue, touchApiKeyLastUsed, type ApiKeyPermission } from './db';

export interface ApiKeyContext {
  id: string;
  permission: ApiKeyPermission;
}

/**
 * Validates the X-API-Key header against the api_keys table.
 * Also accepts the legacy MEMEVAULTPROJECT_API_KEY env var as a read_write key.
 * Returns the key context on success, or null on failure.
 * Uses constant-time comparison to prevent timing-based side-channel attacks.
 */
export function validateApiKey(req: NextRequest): ApiKeyContext | null {
  const provided = req.headers.get('x-api-key');
  if (!provided) return null;

  // Check against DB keys
  const record = getApiKeyByValue(provided);
  if (record) {
    // Fire-and-forget last_used_at update
    try { touchApiKeyLastUsed(record.id); } catch { /* non-critical */ }
    return { id: record.id, permission: record.permission };
  }

  // Fallback: legacy env var key treated as read_write
  const envKey = process.env.MEMEVAULTPROJECT_API_KEY;
  if (envKey) {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(envKey, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { id: '__env__', permission: 'read_write' };
    }
  }

  return null;
}

/** Returns true if the request has any valid API key (read or read_write). */
export function hasReadAccess(req: NextRequest): boolean {
  return validateApiKey(req) !== null;
}

/** Returns true if the request has a read_write API key. */
export function hasWriteAccess(req: NextRequest): boolean {
  const ctx = validateApiKey(req);
  return ctx?.permission === 'read_write';
}
