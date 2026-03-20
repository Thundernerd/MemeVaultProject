import { NextRequest, NextResponse } from 'next/server';
import { listRandomCandidatesWithTags, listSharedMediaWithTags, getSetting } from '@/lib/db';
import { hasReadAccess } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!hasReadAccess(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = getSetting('random_mode') ?? 'flag';
  const candidates = mode === 'shared' ? listSharedMediaWithTags() : listRandomCandidatesWithTags();
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No items available' }, { status: 404 });
  }

  const item = candidates[Math.floor(Math.random() * candidates.length)];

  return NextResponse.json({
    id: item.id,
    url: item.url,
    type: item.type,
    title: item.title,
    description: item.description,
    uploader: item.uploader,
    duration: item.duration,
    file_size: item.file_size,
    format: item.format,
    width: item.width,
    height: item.height,
    created_at: item.created_at,
    tags: item.tags.map((t) => t.name),
    download_url: `/api/v1/download/${item.id}`,
  });
}
