'use client';

import { useState, useEffect, useCallback } from 'react';

interface MediaEntry {
  id: string;
  type: 'video' | 'image';
  title: string | null;
  width: number | null;
  height: number | null;
  has_thumbnail: boolean;
}

interface Props {
  token: string;
  albumTitle: string;
  albumUploader: string | null;
  allowDownload: boolean;
  media: MediaEntry[];
}

export default function ShareAlbumGallery({ token, albumTitle, albumUploader, allowDownload, media }: Props) {
  const [lightbox, setLightbox] = useState<MediaEntry | null>(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') {
        setLightbox((cur) => {
          if (!cur) return null;
          const idx = media.findIndex((m) => m.id === cur.id);
          return media[idx + 1] ?? cur;
        });
      }
      if (e.key === 'ArrowLeft') {
        setLightbox((cur) => {
          if (!cur) return null;
          const idx = media.findIndex((m) => m.id === cur.id);
          return media[idx - 1] ?? cur;
        });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, closeLightbox, media]);

  function fileSrc(id: string) {
    return `/api/share/${token}/media/${id}/file`;
  }

  function thumbnailSrc(item: MediaEntry) {
    return item.has_thumbnail
      ? `/api/share/${token}/media/${item.id}/thumbnail`
      : fileSrc(item.id);
  }

  return (
    <>
      <div className="min-h-screen bg-surface-base flex flex-col">
        <header className="h-16 bg-surface-1/70 backdrop-blur-md border-b border-border flex items-center px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/safe.png" alt="MVP" className="w-8 h-8 shrink-0 invert mix-blend-screen" />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-base font-bold text-text-primary tracking-tight">MVP</span>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-1 px-5 pt-5 pb-3 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-surface-2 text-text-secondary px-2 py-0.5 rounded font-medium">
              album · {media.length} {media.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary leading-snug">{albumTitle}</h1>
          {albumUploader && (
            <p className="text-xs text-text-muted">{albumUploader}</p>
          )}
        </div>

        <div className="flex-1 px-5 pb-6 max-w-5xl mx-auto w-full">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {media.map((item) => (
              <div
                key={item.id}
                className="bg-surface-2 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all group"
                onClick={() => setLightbox(item)}
              >
                <div className="aspect-square overflow-hidden relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailSrc(item)}
                    alt={item.title ?? 'image'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => {
                      const fallback = fileSrc(item.id);
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                  />
                  {item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M6 3.5l7 4.5-7 4.5V3.5z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
                {item.title && (
                  <p className="text-[11px] text-text-secondary px-2 py-1.5 truncate">{item.title}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-auto px-5 py-4 border-t border-border text-center">
          <span className="text-xs text-text-muted">Shared via MemeVault</span>
        </footer>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={closeLightbox}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm text-white/70 truncate max-w-xs">
              {lightbox.title ?? ''}
            </span>
            <div className="flex items-center gap-2">
              {allowDownload && (
                <a
                  href={fileSrc(lightbox.id)}
                  download
                  className="text-sm bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download
                </a>
              )}
              <button
                onClick={closeLightbox}
                className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Media */}
          <div className="flex-1 flex items-center justify-center min-h-0 px-12">
            {lightbox.type === 'video' ? (
              <video
                key={lightbox.id}
                src={fileSrc(lightbox.id)}
                controls
                autoPlay
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={lightbox.id}
                src={fileSrc(lightbox.id)}
                alt={lightbox.title ?? 'image'}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>

          {/* Prev / Next */}
          {media.length > 1 && (() => {
            const idx = media.findIndex((m) => m.id === lightbox.id);
            return (
              <>
                {idx > 0 && (
                  <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
                    onClick={(e) => { e.stopPropagation(); setLightbox(media[idx - 1]); }}
                  >
                    ‹
                  </button>
                )}
                {idx < media.length - 1 && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
                    onClick={(e) => { e.stopPropagation(); setLightbox(media[idx + 1]); }}
                  >
                    ›
                  </button>
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
                  {idx + 1} / {media.length}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
