import { NextRequest, NextResponse } from 'next/server';
import { getShareLink, getMediaItem } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = getShareLink(token);
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const media = getMediaItem(link.media_id);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Return a safe public subset — no file_path, thumbnail_path, raw_metadata
  return NextResponse.json({
    id: media.id,
    type: media.type,
    title: media.title,
    description: media.description,
    url: media.url,
    uploader: media.uploader,
    duration: media.duration,
    width: media.width,
    height: media.height,
    format: media.format,
    file_size: media.file_size,
    has_thumbnail: !!media.thumbnail_path,
    created_at: media.created_at,
    allow_download: link.allow_download === 1,
    expires_at: link.expires_at,
  });
}
