import { NextRequest, NextResponse } from 'next/server';
import { insertQueueItem, type Downloader } from '@/lib/db';
import { isValidApiKey } from '@/lib/auth';

const TYPE_TO_DOWNLOADER: Record<string, Downloader> = {
  video: 'ytdlp',
  image: 'gallery-dl',
};

export async function POST(req: NextRequest) {
  if (!isValidApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { url, type } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  if (!type || typeof type !== 'string' || !(type in TYPE_TO_DOWNLOADER)) {
    return NextResponse.json(
      { error: 'type is required and must be "video" or "image"' },
      { status: 400 }
    );
  }

  const downloader = TYPE_TO_DOWNLOADER[type];
  const item = insertQueueItem(url.trim(), downloader);
  return NextResponse.json({ id: item.id }, { status: 201 });
}
