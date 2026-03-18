import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getQueueItem, getMediaByQueueItem } from '@/lib/db';
import { hasReadAccess } from '@/lib/auth';
import { mimeType } from '@/lib/utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasReadAccess(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const item = getQueueItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.status !== 'completed') {
    return NextResponse.json(
      { error: 'Download not completed yet', status: item.status },
      { status: 404 }
    );
  }

  const mediaItems = getMediaByQueueItem(id);
  if (mediaItems.length === 0) {
    return NextResponse.json({ error: 'No media files found' }, { status: 404 });
  }

  // Single file — stream directly
  if (mediaItems.length === 1) {
    return streamFile(mediaItems[0].file_path);
  }

  // Multiple files — build a ZIP on the fly
  return streamZip(mediaItems.map((m) => m.file_path));
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

async function streamZip(filePaths: string[]): Promise<NextResponse> {
  // Build a minimal ZIP archive in memory
  // Using the built-in Node.js zlib is not suitable for ZIP; we do a simple
  // uncompressed ZIP (store method) which needs no extra dependencies.
  const chunks: Buffer[] = [];

  let offset = 0;
  const centralDir: Buffer[] = [];

  for (const filePath of filePaths) {
    let data: Buffer;
    try {
      data = fs.readFileSync(filePath);
    } catch {
      continue;
    }

    const filename = Buffer.from(path.basename(filePath), 'utf8');
    const crc = crc32(data);
    const size = data.length;

    // Local file header
    const localHeader = Buffer.alloc(30 + filename.length);
    localHeader.writeUInt32LE(0x04034b50, 0);   // signature
    localHeader.writeUInt16LE(20, 4);            // version needed
    localHeader.writeUInt16LE(0, 6);             // flags
    localHeader.writeUInt16LE(0, 8);             // compression: store
    localHeader.writeUInt16LE(0, 10);            // mod time
    localHeader.writeUInt16LE(0, 12);            // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localHeader.writeUInt16LE(0, 28);
    filename.copy(localHeader, 30);

    // Central directory entry
    const centralEntry = Buffer.alloc(46 + filename.length);
    centralEntry.writeUInt32LE(0x02014b50, 0);
    centralEntry.writeUInt16LE(20, 4);
    centralEntry.writeUInt16LE(20, 6);
    centralEntry.writeUInt16LE(0, 8);
    centralEntry.writeUInt16LE(0, 10);
    centralEntry.writeUInt16LE(0, 12);
    centralEntry.writeUInt16LE(0, 14);
    centralEntry.writeUInt32LE(crc, 16);
    centralEntry.writeUInt32LE(size, 20);
    centralEntry.writeUInt32LE(size, 24);
    centralEntry.writeUInt16LE(filename.length, 28);
    centralEntry.writeUInt16LE(0, 30);
    centralEntry.writeUInt16LE(0, 32);
    centralEntry.writeUInt16LE(0, 34);
    centralEntry.writeUInt16LE(0, 36);
    centralEntry.writeUInt32LE(0, 38);
    centralEntry.writeUInt32LE(offset, 42);
    filename.copy(centralEntry, 46);

    chunks.push(localHeader, data);
    centralDir.push(centralEntry);
    offset += localHeader.length + size;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(centralDir.length, 8);
  endRecord.writeUInt16LE(centralDir.length, 10);
  endRecord.writeUInt32LE(centralDirBuf.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  const zip = Buffer.concat([...chunks, centralDirBuf, endRecord]);

  return new NextResponse(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="gallery.zip"',
      'Content-Length': String(zip.length),
    },
  });
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

