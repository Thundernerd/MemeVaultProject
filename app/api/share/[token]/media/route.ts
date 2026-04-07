import { NextRequest, NextResponse } from 'next/server';
import { getAlbumShareLink, getMediaItemsByAlbum } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = getAlbumShareLink(token);
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const media = getMediaItemsByAlbum(link.album_id);
  return NextResponse.json(
    media.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      width: m.width,
      height: m.height,
      has_thumbnail: !!m.thumbnail_path,
    }))
  );
}
