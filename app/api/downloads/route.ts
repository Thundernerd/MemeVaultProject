import { NextRequest, NextResponse } from 'next/server';
import { insertQueueItem, type Downloader } from '@/lib/db';

export async function POST(req: NextRequest) {
  let body: { url?: string; downloader?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { url, downloader = 'ytdlp' } = body;
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const validDownloaders: Downloader[] = ['ytdlp', 'gallery-dl'];
  if (!validDownloaders.includes(downloader as Downloader)) {
    return NextResponse.json({ error: 'downloader must be ytdlp or gallery-dl' }, { status: 400 });
  }

  const item = insertQueueItem(url.trim(), downloader as Downloader);
  return NextResponse.json(item, { status: 201 });
}
