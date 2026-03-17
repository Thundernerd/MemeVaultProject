import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getShareLink, getMediaItem } from '@/lib/db';
import { mimeType } from '@/lib/utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = getShareLink(token);
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const media = getMediaItem(link.media_id);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filePath = media.file_path;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 });
  }

  if (!stat.isFile()) {
    return NextResponse.json({ error: 'Not a file' }, { status: 400 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeType(ext);
  const filename = path.basename(filePath);

  const range = req.headers.get('range');
  if (range) {
    const size = stat.size;
    const [startStr, endStr] = range.replace(/^bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : size - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }

    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
