import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSetting, insertMediaItem, upsertTag, addTagToMedia } from '@/lib/db';
import { autoTagMedia } from '@/lib/autotag';
import { probeFile, generateVideoThumbnail } from '@/lib/ffprobe';

export const maxDuration = 60;

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
  'video/avi', 'video/x-flv', 'video/x-ms-wmv', 'video/3gpp',
]);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/avif', 'image/tiff', 'image/bmp',
]);

function isAllowedMime(mime: string): boolean {
  return ALLOWED_VIDEO_TYPES.has(mime) || ALLOWED_IMAGE_TYPES.has(mime);
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const downloadPath = getSetting('download_path') ?? '.';
  fs.mkdirSync(downloadPath, { recursive: true });

  const results: { success: boolean; filename: string; media?: object; error?: string }[] = [];

  for (const file of files) {
    const originalName = file.name;
    const mime = file.type;

    if (!isAllowedMime(mime)) {
      results.push({ success: false, filename: originalName, error: 'Unsupported file type' });
      continue;
    }

    const isVideo = ALLOWED_VIDEO_TYPES.has(mime);
    const ext = path.extname(originalName).toLowerCase() || '.' + mime.split('/')[1];
    const uploadDir = path.join(downloadPath, `upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

    try {
      fs.mkdirSync(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, `media${ext}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      const probe = await probeFile(filePath);

      let thumbnailPath: string | null = null;
      if (isVideo) {
        const thumbPath = path.join(uploadDir, 'thumbnail.jpg');
        const ok = await generateVideoThumbnail(filePath, thumbPath);
        if (ok) thumbnailPath = thumbPath;
      } else {
        thumbnailPath = filePath;
      }

      const title = path.basename(originalName, path.extname(originalName)) || originalName;
      const format = probe.format ?? (ext.slice(1) || null);

      const mediaItem = insertMediaItem({
        queue_item_id: null,
        url: `local://${originalName}`,
        type: isVideo ? 'video' : 'image',
        title,
        description: null,
        uploader: null,
        duration: probe.duration,
        thumbnail_path: thumbnailPath,
        file_path: filePath,
        file_size: fs.statSync(filePath).size,
        format,
        width: probe.width,
        height: probe.height,
        raw_metadata: null,
        album_id: null,
      });

      autoTagMedia({
        mediaId: mediaItem.id,
        url: mediaItem.url,
        type: mediaItem.type,
        uploader: null,
        format: mediaItem.format,
        createdAt: mediaItem.created_at,
      });

      const uploadTag = upsertTag('source:upload');
      addTagToMedia(mediaItem.id, uploadTag.id);

      results.push({ success: true, filename: originalName, media: mediaItem });
    } catch (err) {
      try { fs.rmSync(uploadDir, { recursive: true, force: true }); } catch { /* ignore */ }
      results.push({
        success: false,
        filename: originalName,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }

  return NextResponse.json({ results });
}
