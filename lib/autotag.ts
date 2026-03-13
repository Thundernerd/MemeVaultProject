import { addTagToMedia, upsertTag } from './db';
import type { MediaType } from './db';

/**
 * Auto-generates and attaches tags to a freshly inserted media item.
 * Never throws — tag failures should never block a download.
 */
export function autoTagMedia(params: {
  mediaId: string;
  url: string;
  type: MediaType;
  uploader?: string | null;
  format?: string | null;
  createdAt: string;
}): void {
  const candidates: string[] = [];

  // Media type
  candidates.push(params.type);

  // Hostname — strip www. prefix, take the registrable part (e.g. "youtube")
  try {
    const hostname = new URL(params.url).hostname.replace(/^www\./, '');
    // Use the domain without TLD for well-known sites, full hostname otherwise
    const parts = hostname.split('.');
    const label = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    if (label) candidates.push(label.toLowerCase());
  } catch {
    // invalid URL — skip
  }

  // Uploader (trim, truncate long names)
  if (params.uploader) {
    const name = params.uploader.trim();
    if (name.length > 0 && name.length <= 64) {
      candidates.push(name.toLowerCase());
    }
  }

  // Year
  try {
    const year = new Date(params.createdAt).getFullYear();
    if (year > 2000 && year < 2100) candidates.push(String(year));
  } catch {
    // skip
  }

  // Format (e.g. "mp4", "jpg")
  if (params.format) {
    const fmt = params.format.trim().toLowerCase();
    if (fmt.length > 0 && fmt.length <= 10) candidates.push(fmt);
  }

  for (const name of candidates) {
    if (!name) continue;
    try {
      const tag = upsertTag(name);
      addTagToMedia(params.mediaId, tag.id);
    } catch {
      // skip individual failures
    }
  }
}
