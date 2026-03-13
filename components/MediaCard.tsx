'use client';

import { useState } from 'react';
import MediaModal, { type ModalMediaItem } from './MediaModal';

interface Props {
  item: ModalMediaItem;
  onDeleted: () => void;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MediaCard({ item, onDeleted }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const thumbnailSrc = item.thumbnail_path ? `/api/media/${item.id}/thumbnail` : null;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this item and its files?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col group cursor-pointer hover:border-zinc-600 transition-colors"
        onClick={() => setModalOpen(true)}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-zinc-800 overflow-hidden">
          {thumbnailSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc}
              alt={item.title ?? 'thumbnail'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-4xl select-none">
              {item.type === 'video' ? '▶' : '🖼'}
            </div>
          )}

          {/* Type badge */}
          <span className="absolute top-2 left-2 bg-black/60 text-xs text-white px-2 py-0.5 rounded">
            {item.type === 'video' ? 'video' : 'image'}
          </span>

          {/* Duration badge */}
          {item.duration && item.type === 'video' && (
            <span className="absolute bottom-2 right-2 bg-black/70 text-xs text-white px-1.5 py-0.5 rounded">
              {formatDuration(item.duration)}
            </span>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <span className="text-white text-4xl drop-shadow">
              {item.type === 'video' ? '▶' : '🔍'}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col gap-1 flex-1">
          <p
            className="text-sm font-medium text-white truncate"
            title={item.title ?? undefined}
          >
            {item.title ?? item.file_path.split('/').pop() ?? item.file_path}
          </p>
          {item.uploader && (
            <p className="text-xs text-zinc-500 truncate">{item.uploader}</p>
          )}
          {item.width && item.height ? (
            <p className="text-xs text-zinc-600">{item.width}×{item.height}</p>
          ) : null}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-medium"
                >
                  {tag.name}
                </span>
              ))}
              {item.tags.length > 5 && (
                <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-600 text-[10px]">
                  +{item.tags.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-3 pb-3 flex gap-2">
        <a
          href={`/api/media/${item.id}/file`}
          download
          className="flex-1 text-center text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1.5 rounded-lg transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
            Download
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 text-xs bg-red-900/40 hover:bg-red-800/60 text-red-400 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>

      {modalOpen && (
        <MediaModal
          item={item}
          onClose={() => setModalOpen(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}
