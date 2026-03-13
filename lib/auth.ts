import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSetting } from './db';

/**
 * Returns true if the request carries a valid X-API-Key header.
 * Uses a constant-time comparison to prevent timing-based side-channel attacks.
 * Must be called from a Node.js route handler (not Edge middleware).
 */
export function isValidApiKey(req: NextRequest): boolean {
  const provided = req.headers.get('x-api-key');
  if (!provided) return false;
  const stored = getSetting('api_key');
  if (!stored) return false;
  // Buffers must be the same length for timingSafeEqual; encode both to UTF-8.
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
