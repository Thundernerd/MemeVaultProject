/** Pick the most useful lines and append them to an error message. */
export function buildErrorDetail(primary: string[], fallback: string[]): string {
  const lines = primary.length > 0 ? primary : fallback;
  if (lines.length === 0) return '';
  const snippet = lines.slice(-5).join('\n');
  return `\n\n${snippet}`;
}

/** Maps a file extension to its MIME type. */
export function mimeType(ext: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.m4v': 'video/x-m4v',
    '.ts': 'video/mp2t',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.svg': 'image/svg+xml',
  };
  return map[ext] ?? 'application/octet-stream';
}
