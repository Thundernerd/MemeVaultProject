import { NextRequest, NextResponse } from 'next/server';
import { getAlbumShareLink, deleteAlbumShareLink } from '@/lib/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await params;
  const link = getAlbumShareLink(token);
  if (!link || link.album_id !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  deleteAlbumShareLink(token);
  return new NextResponse(null, { status: 204 });
}
