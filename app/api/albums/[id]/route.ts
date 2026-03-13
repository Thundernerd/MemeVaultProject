import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { deleteAlbum } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const album = deleteAlbum(id);
  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // All gallery-dl files for one job live in the same directory — delete it once
  const dirs = new Set(album.media.map((m) => path.dirname(m.file_path)));
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* already gone */ }
  }

  return new NextResponse(null, { status: 204 });
}
