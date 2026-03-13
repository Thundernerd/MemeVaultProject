import fs from 'fs';
import path from 'path';
import {
  getNextPendingItem,
  countActiveDownloads,
  updateQueueItem,
  insertMediaItem,
  insertAlbum,
  getSetting,
} from './db';
import { runYtdlp } from './ytdlp';
import { runGalleryDl } from './gallerydl';
import { autoTagMedia } from './autotag';

let initialized = false;

export function startQueueProcessor(): void {
  if (initialized) return;
  initialized = true;
  scheduleNext();
}

function scheduleNext(): void {
  setTimeout(() => {
    processNext().finally(scheduleNext);
  }, 2000);
}

async function processNext(): Promise<void> {
  const maxConcurrent = parseInt(getSetting('max_concurrent_downloads') ?? '2', 10);
  const active = countActiveDownloads();
  if (active >= maxConcurrent) return;

  const item = getNextPendingItem();
  if (!item) return;

  updateQueueItem(item.id, { status: 'downloading', progress: 0 });

  try {
    if (item.downloader === 'ytdlp') {
      await processYtdlp(item.id, item.url);
    } else {
      await processGalleryDl(item.id, item.url);
    }
    updateQueueItem(item.id, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateQueueItem(item.id, {
      status: 'failed',
      error: msg,
      completed_at: new Date().toISOString(),
    });
  }
}

async function processYtdlp(queueItemId: string, url: string): Promise<void> {
  const result = await runYtdlp(url, (pct) => {
    updateQueueItem(queueItemId, { progress: pct });
  });

  const m = result.metadata;
  const mediaItem = insertMediaItem({
    queue_item_id: queueItemId,
    url: (m.webpage_url as string | undefined) ?? url,
    type: 'video',
    title: (m.title as string | undefined) ?? null,
    description: (m.description as string | undefined) ?? null,
    uploader: (m.uploader as string | undefined) ?? null,
    duration: typeof m.duration === 'number' ? m.duration : null,
    thumbnail_path: result.thumbnailPath,
    file_path: result.filePath,
    file_size: getFileSize(result.filePath),
    format: (m.format as string | undefined) ?? (path.extname(result.filePath).slice(1) || null),
    width: typeof m.width === 'number' ? m.width : null,
    height: typeof m.height === 'number' ? m.height : null,
    raw_metadata: JSON.stringify(m),
    album_id: null,
  });
  autoTagMedia({
    mediaId: mediaItem.id,
    url: mediaItem.url,
    type: 'video',
    uploader: mediaItem.uploader,
    format: mediaItem.format,
    createdAt: mediaItem.created_at,
  });
}

async function processGalleryDl(queueItemId: string, url: string): Promise<void> {
  const files = await runGalleryDl(url, (count) => {
    updateQueueItem(queueItemId, { progress: Math.min(count * 5, 95) });
  });

  // For multi-image downloads, group everything into an album
  let albumId: string | null = null;
  if (files.length > 1) {
    const firstMeta = files[0].metadata;
    const uploader =
      (firstMeta.uploader as string | undefined) ??
      (firstMeta.author as string | undefined) ??
      null;
    const album = insertAlbum({
      queue_item_id: queueItemId,
      url,
      title: (firstMeta.title as string | undefined) ?? null,
      uploader,
    });
    albumId = album.id;
  }

  for (const file of files) {
    const m = file.metadata;
    const uploader = (m.uploader as string | undefined) ?? (m.author as string | undefined) ?? null;
    const format = path.extname(file.filePath).slice(1) || null;
    const mediaItem = insertMediaItem({
      queue_item_id: queueItemId,
      url,
      type: 'image',
      title: (m.title as string | undefined) ?? null,
      description: (m.description as string | undefined) ?? null,
      uploader,
      duration: null,
      thumbnail_path: file.thumbnailPath,
      file_path: file.filePath,
      file_size: getFileSize(file.filePath),
      format,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
      raw_metadata: JSON.stringify(m),
      album_id: albumId,
    });
    autoTagMedia({
      mediaId: mediaItem.id,
      url,
      type: 'image',
      uploader,
      format,
      createdAt: mediaItem.created_at,
    });
  }
}

function getFileSize(filePath: string): number | null {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}
