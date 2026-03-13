import { NextRequest } from 'next/server';
import { getSetting } from './db';

/**
 * Returns true if the request carries a valid X-API-Key header.
 * Must be called from a Node.js route handler (not Edge middleware).
 */
export function isValidApiKey(req: NextRequest): boolean {
  const provided = req.headers.get('x-api-key');
  if (!provided) return false;
  const stored = getSetting('api_key');
  if (!stored) return false;
  return provided === stored;
}
