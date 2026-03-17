import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getShareLink, getMediaItem } from '@/lib/db';
import { mimeType } from '@/lib/utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = getShareLink(token);
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const media = getMediaItem(link.media_id);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!media.thumbnail_path) return NextResponse.json({ error: 'No thumbnail' }, { status: 404 });

  let data: Buffer;
  try {
    data = fs.readFileSync(media.thumbnail_path);
  } catch {
    return NextResponse.json({ error: 'Thumbnail file missing' }, { status: 404 });
  }

  const ext = path.extname(media.thumbnail_path).toLowerCase();
  const contentType = mimeType(ext) === 'application/octet-stream' ? 'image/jpeg' : mimeType(ext);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
