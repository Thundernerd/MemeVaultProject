import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMediaItemWithTags, deleteMediaItem } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getMediaItemWithTags(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = deleteMediaItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the entire job directory (contains the media file, thumbnail, metadata, etc.)
  try {
    const dir = path.dirname(item.file_path);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* already gone */ }

  return new NextResponse(null, { status: 204 });
}
