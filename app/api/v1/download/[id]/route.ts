import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMediaItem } from '@/lib/db';
import { hasReadAccess } from '@/lib/auth';
import { mimeType } from '@/lib/utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasReadAccess(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const item = getMediaItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return streamFile(item.file_path);
}

function streamFile(filePath: string): NextResponse {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeType(ext);
  const filename = path.basename(filePath);
  const stream = fs.createReadStream(filePath);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

