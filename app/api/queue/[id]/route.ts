import { NextRequest, NextResponse } from 'next/server';
import { getQueueItem, deleteQueueItem } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  deleteQueueItem(id);
  return new NextResponse(null, { status: 204 });
}
