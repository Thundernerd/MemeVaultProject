import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMediaItem } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getMediaItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!item.thumbnail_path) return NextResponse.json({ error: 'No thumbnail' }, { status: 404 });

  let data: Buffer;
  try {
    data = fs.readFileSync(item.thumbnail_path);
  } catch {
    return NextResponse.json({ error: 'Thumbnail file missing' }, { status: 404 });
  }

  const ext = path.extname(item.thumbnail_path).toLowerCase();
  const CONTENT_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.svg': 'image/svg+xml',
  };
  const contentType = CONTENT_TYPES[ext] ?? 'image/jpeg';

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
