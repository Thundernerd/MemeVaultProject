import { addTagToMedia, upsertTag } from './db';
import type { MediaType } from './db';

// Maps hostname labels to canonical platform names where the label differs
const PLATFORM_ALIASES: Record<string, string> = {
  twitter: 'x',
  youtu: 'youtube',
};

/**
 * Auto-generates and attaches namespaced tags to a freshly inserted media item.
 * Tags use the format `namespace:value` (e.g. `platform:youtube`, `type:video`).
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
  candidates.push(`type:${params.type}`);

  // Platform — local:// URLs get platform:upload, others extract hostname
  if (params.url.startsWith('local://')) {
    candidates.push('platform:upload');
  } else {
    try {
      const hostname = new URL(params.url).hostname.replace(/^www\./, '');
      const parts = hostname.split('.');
      const raw = parts.length >= 2 ? parts[parts.length - 2] : hostname;
      if (raw) {
        const label = PLATFORM_ALIASES[raw.toLowerCase()] ?? raw.toLowerCase();
        candidates.push(`platform:${label}`);
      }
    } catch {
      // invalid URL — skip
    }
  }

  // Uploader (trim, truncate long names)
  if (params.uploader) {
    const name = params.uploader.trim();
    if (name.length > 0 && name.length <= 64) {
      candidates.push(`uploader:${name.toLowerCase()}`);
    }
  }

  // Year
  try {
    const year = new Date(params.createdAt).getFullYear();
    if (year > 2000 && year < 2100) candidates.push(`date:${year}`);
  } catch {
    // skip
  }

  // Format (e.g. "mp4", "jpg")
  if (params.format) {
    const fmt = params.format.trim().toLowerCase();
    if (fmt.length > 0 && fmt.length <= 10) candidates.push(`format:${fmt}`);
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
