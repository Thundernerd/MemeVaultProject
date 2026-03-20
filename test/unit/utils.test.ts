import { describe, it, expect } from 'vitest';
import { buildErrorDetail, mimeType } from '@/lib/utils';

describe('mimeType', () => {
  it('maps common video extensions', () => {
    expect(mimeType('.mp4')).toBe('video/mp4');
    expect(mimeType('.webm')).toBe('video/webm');
    expect(mimeType('.mkv')).toBe('video/x-matroska');
    expect(mimeType('.avi')).toBe('video/x-msvideo');
    expect(mimeType('.mov')).toBe('video/quicktime');
    expect(mimeType('.flv')).toBe('video/x-flv');
    expect(mimeType('.wmv')).toBe('video/x-ms-wmv');
    expect(mimeType('.m4v')).toBe('video/x-m4v');
    expect(mimeType('.ts')).toBe('video/mp2t');
  });

  it('maps common image extensions', () => {
    expect(mimeType('.jpg')).toBe('image/jpeg');
    expect(mimeType('.jpeg')).toBe('image/jpeg');
    expect(mimeType('.png')).toBe('image/png');
    expect(mimeType('.gif')).toBe('image/gif');
    expect(mimeType('.webp')).toBe('image/webp');
    expect(mimeType('.avif')).toBe('image/avif');
    expect(mimeType('.bmp')).toBe('image/bmp');
    expect(mimeType('.tiff')).toBe('image/tiff');
    expect(mimeType('.tif')).toBe('image/tiff');
    expect(mimeType('.svg')).toBe('image/svg+xml');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(mimeType('.xyz')).toBe('application/octet-stream');
    expect(mimeType('.pdf')).toBe('application/octet-stream');
    expect(mimeType('')).toBe('application/octet-stream');
    expect(mimeType('.UNKNOWN')).toBe('application/octet-stream');
  });
});

describe('buildErrorDetail', () => {
  it('returns empty string when both arrays are empty', () => {
    expect(buildErrorDetail([], [])).toBe('');
  });

  it('uses primary lines when non-empty', () => {
    const result = buildErrorDetail(['line A'], ['fallback']);
    expect(result).toBe('\n\nline A');
  });

  it('falls back to fallback array when primary is empty', () => {
    const result = buildErrorDetail([], ['fallback line']);
    expect(result).toBe('\n\nfallback line');
  });

  it('returns empty string when primary empty and fallback empty', () => {
    expect(buildErrorDetail([], [])).toBe('');
  });

  it('takes only the last 5 lines of a longer input', () => {
    const lines = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];
    const result = buildErrorDetail(lines, []);
    expect(result).toBe('\n\nL3\nL4\nL5\nL6\nL7');
  });

  it('includes all lines when 5 or fewer', () => {
    const lines = ['A', 'B', 'C'];
    const result = buildErrorDetail(lines, []);
    expect(result).toBe('\n\nA\nB\nC');
  });

  it('always prepends a double newline', () => {
    const result = buildErrorDetail(['x'], []);
    expect(result.startsWith('\n\n')).toBe(true);
  });
});
