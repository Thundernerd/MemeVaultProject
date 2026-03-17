import { NextRequest, NextResponse } from 'next/server';
import { getMediaItem, createShareLink, getShareLinksForMedia } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getMediaItem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const links = getShareLinksForMedia(id);
  return NextResponse.json(links);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getMediaItem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const allowDownload = body.allowDownload !== false;
  const expiresAt: string | null = body.expiresAt ?? null;

  const link = createShareLink(id, allowDownload, expiresAt);
  return NextResponse.json(link, { status: 201 });
}
