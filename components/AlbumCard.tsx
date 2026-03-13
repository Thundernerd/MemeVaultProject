'use client';

import { useState, useMemo } from 'react';
import type { AlbumWithMedia } from '@/lib/db';
import AlbumModal from './AlbumModal';

interface Props {
  album: AlbumWithMedia;
  onDeleted: () => void;
}

export default function AlbumCard({ album, onDeleted }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cover = album.media[0] ?? null;
  const coverSrc = cover?.thumbnail_path
    ? `/api/media/${cover.id}/thumbnail`
    : cover
    ? `/api/media/${cover.id}/file`
    : null;

  // Collect unique tags across all media in the album
  const tags = useMemo(() => {
    const tagMap = new Map<string, { id: string; name: string }>();
    for (const item of album.media) {
      for (const tag of item.tags) tagMap.set(tag.id, tag);
    }
    return Array.from(tagMap.values());
  }, [album.media]);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete this album and all ${album.media.length} images from disk?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/albums/${album.id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const displayTitle = album.title ?? album.url;

  return (
    <>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col group cursor-pointer hover:border-zinc-600 transition-colors"
        onClick={() => setModalOpen(true)}
      >
        {/* Stacked thumbnail effect */}
        <div className="relative aspect-video bg-zinc-800 overflow-visible">
          {/* Back layers for stack effect */}
          {album.media.length > 2 && (
            <div className="absolute inset-x-3 -top-1.5 h-full bg-zinc-700 rounded-t-lg -z-10" />
          )}
          {album.media.length > 1 && (
            <div className="absolute inset-x-1.5 -top-0.5 h-full bg-zinc-800 rounded-t-lg -z-10 border border-zinc-700" />
          )}

          {/* Cover image */}
          <div className="relative w-full h-full overflow-hidden rounded-t-sm">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverSrc}
                alt={displayTitle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-4xl select-none">
                🖼
              </div>
            )}

            {/* Album badge */}
            <span className="absolute top-2 left-2 bg-black/60 text-xs text-white px-2 py-0.5 rounded">
              album · {album.media.length}
            </span>

            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <span className="text-white text-4xl drop-shadow">⊞</span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col gap-1 flex-1">
          <p
            className="text-sm font-medium text-white truncate"
            title={displayTitle}
          >
            {displayTitle}
          </p>
          {album.uploader && (
            <p className="text-xs text-zinc-500 truncate">{album.uploader}</p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-medium"
                >
                  {tag.name}
                </span>
              ))}
              {tags.length > 5 && (
                <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-600 text-[10px]">
                  +{tags.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-3 pb-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full text-xs bg-red-900/40 hover:bg-red-800/60 text-red-400 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>

      {modalOpen && (
        <AlbumModal
          album={album}
          onClose={() => setModalOpen(false)}
          onDeleted={() => {
            setModalOpen(false);
            onDeleted();
          }}
        />
      )}
    </>
  );
}
