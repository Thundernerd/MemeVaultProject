import { NextRequest, NextResponse } from 'next/server';
import { getQueueItem, deleteQueueItem } from '@/lib/db';
import { cancelDownload } from '@/lib/queue';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { action?: string };
  if (body.action !== 'cancel') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.status !== 'pending' && item.status !== 'downloading') {
    return NextResponse.json({ error: 'Item cannot be cancelled' }, { status: 409 });
  }
  cancelDownload(id);
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  deleteQueueItem(id);
  return new NextResponse(null, { status: 204 });
}
