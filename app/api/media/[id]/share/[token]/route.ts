import { NextRequest, NextResponse } from 'next/server';
import { getShareLink, deleteShareLink } from '@/lib/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await params;
  const link = getShareLink(token);
  if (!link || link.media_id !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  deleteShareLink(token);
  return new NextResponse(null, { status: 204 });
}
