import { NextRequest, NextResponse } from 'next/server';
import { getQueueItem, getMediaByQueueItem } from '@/lib/db';
import { isValidApiKey } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const mediaItems = getMediaByQueueItem(id);
  return NextResponse.json({
    id: item.id,
    url: item.url,
    downloader: item.downloader,
    status: item.status,
    progress: item.progress,
    error: item.error,
    created_at: item.created_at,
    completed_at: item.completed_at,
    media_ids: mediaItems.map((m) => m.id),
  });
}
