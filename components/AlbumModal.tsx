'use client';

import { useEffect, useState, useCallback } from 'react';
import type { AlbumWithMedia, AlbumShareLink } from '@/lib/db';
import MediaModal from './MediaModal';
import type { ModalMediaItem } from './MediaModal';

interface Props {
  album: AlbumWithMedia;
  onClose: () => void;
  onDeleted: () => void;
}

export default function AlbumModal({ album, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Share state
  const [shareLinks, setShareLinks] = useState<AlbumShareLink[]>([]);
  const [shareExpanded, setShareExpanded] = useState(false);
  const [shareAllowDownload, setShareAllowDownload] = useState(true);
  const [shareExpiryDays, setShareExpiryDays] = useState('');
  const [shareCreating, setShareCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const visibleMedia = album.media.filter((m) => !deletedIds.has(m.id));
  const selectedItem = selectedIndex !== null ? (visibleMedia[selectedIndex] ?? null) : null;

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.share_default_expiry_days !== undefined) setShareExpiryDays(s.share_default_expiry_days);
        if (s.share_default_allow_download !== undefined) setShareAllowDownload(s.share_default_allow_download === '1');
      })
      .catch(() => {});
    fetch(`/api/albums/${album.id}/share`)
      .then((r) => r.json())
      .then((data: AlbumShareLink[]) => setShareLinks(data))
      .catch(() => {});
  }, [album.id]);

  async function handleCreateShareLink() {
    setShareCreating(true);
    try {
      let expiresAt: string | null = null;
      if (shareExpiryDays) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(shareExpiryDays, 10));
        expiresAt = d.toISOString();
      }
      const res = await fetch(`/api/albums/${album.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowDownload: shareAllowDownload, expiresAt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const link: AlbumShareLink = await res.json();
      setShareLinks((prev) => [link, ...prev]);
    } catch { /* ignore */ }
    setShareCreating(false);
  }

  async function handleRevokeShareLink(token: string) {
    await fetch(`/api/albums/${album.id}/share/${token}`, { method: 'DELETE' }).catch(() => {});
    setShareLinks((prev) => prev.filter((l) => l.token !== token));
  }

  async function copyShareLink(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedIndex !== null) setSelectedIndex(null);
        else onClose();
      } else if (e.key === 'ArrowRight' && selectedIndex !== null) {
        setSelectedIndex((i) => (i !== null ? Math.min(i + 1, visibleMedia.length - 1) : null));
      } else if (e.key === 'ArrowLeft' && selectedIndex !== null) {
        setSelectedIndex((i) => (i !== null ? Math.max(i - 1, 0) : null));
      }
    },
    [onClose, selectedIndex, visibleMedia.length]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  async function handleDelete() {
    if (!confirm(`Delete this album and all ${album.media.length} images from disk?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/albums/${album.id}`, { method: 'DELETE' });
      onClose();
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const displayTitle = album.title ?? album.url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-surface-1 border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-text-secondary hover:text-text-primary bg-surface-2/80 hover:bg-surface-3 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div className="p-5 pb-3 flex flex-col gap-1 border-b border-border pr-12">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-surface-2 text-text-secondary px-2 py-0.5 rounded font-medium">
              album · {album.media.length} images
            </span>
          </div>
          <h2 className="text-lg font-semibold text-text-primary leading-snug truncate" title={displayTitle}>
            {displayTitle}
          </h2>
          {album.uploader && (
            <p className="text-xs text-text-muted truncate">{album.uploader}</p>
          )}
          {album.url && (
            <a
              href={album.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:text-accent-hover truncate transition-colors"
              title={album.url}
            >
              {album.url}
            </a>
          )}
        </div>

        {/* Image grid */}
        <div className="overflow-y-auto flex-1 p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {visibleMedia.map((item) => {
              const thumbnailSrc = item.thumbnail_path
                ? `/api/media/${item.id}/thumbnail`
                : `/api/media/${item.id}/file`;
              return (
                <div
                  key={item.id}
                  className="bg-surface-2 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all group"
                  onClick={() => setSelectedIndex(visibleMedia.indexOf(item))}
                >
                  <div className="aspect-square overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailSrc}
                      alt={item.title ?? 'image'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        const fileSrc = `/api/media/${item.id}/file`;
                        if (e.currentTarget.src !== fileSrc) e.currentTarget.src = fileSrc;
                      }}
                    />
                  </div>
                  {item.title && (
                    <p className="text-[11px] text-text-secondary px-2 py-1.5 truncate">{item.title}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border p-4 flex flex-col gap-3">
          {/* Share section */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShareExpanded((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors self-start"
            >
              <span>Share album</span>
              {shareLinks.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary normal-case tracking-normal font-normal">
                  {shareLinks.length}
                </span>
              )}
              <span>{shareExpanded ? '▲' : '▼'}</span>
            </button>

            {shareExpanded && (
              <div className="flex flex-col gap-3 bg-surface-2/50 rounded-xl p-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareAllowDownload}
                      onChange={(e) => setShareAllowDownload(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-blue-500"
                    />
                    Allow download
                  </label>
                  <select
                    value={shareExpiryDays}
                    onChange={(e) => setShareExpiryDays(e.target.value)}
                    className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-border-strong"
                  >
                    <option value="">No expiry</option>
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                  <button
                    onClick={handleCreateShareLink}
                    disabled={shareCreating}
                    className="text-sm px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {shareCreating ? 'Creating…' : 'Create link'}
                  </button>
                </div>

                {shareLinks.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {shareLinks.map((link) => (
                      <div
                        key={link.token}
                        className="flex items-center gap-2 text-xs bg-surface-base rounded-lg px-3 py-2"
                      >
                        <span className="text-text-muted font-mono flex-1 truncate min-w-0">
                          /share/{link.token.slice(0, 8)}…
                        </span>
                        <span className="text-text-muted shrink-0">
                          {link.expires_at
                            ? new Date(link.expires_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
                            : 'no expiry'}
                        </span>
                        <span className="text-text-muted shrink-0">
                          {link.allow_download ? '⬇' : ''}
                        </span>
                        <button
                          onClick={() => copyShareLink(link.token)}
                          className="shrink-0 px-2 py-1 bg-surface-2 hover:bg-surface-3 text-text-secondary rounded transition-colors"
                        >
                          {copiedToken === link.token ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                          onClick={() => handleRevokeShareLink(link.token)}
                          className="shrink-0 px-2 py-1 bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {shareLinks.length === 0 && (
                  <p className="text-xs text-text-muted italic">No active share links</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full text-sm bg-red-900/40 hover:bg-red-800/60 text-red-400 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : `Delete album (${visibleMedia.length} images)`}
          </button>
        </div>
      </div>

      {/* Individual image modal */}
      {selectedItem && (
        <MediaModal
          item={selectedItem}
          onClose={() => setSelectedIndex(null)}
          onDeleted={() => {
            setDeletedIds((prev) => new Set([...prev, selectedItem.id]));
            setSelectedIndex(null);
            onDeleted();
          }}
          onPrev={selectedIndex !== null && selectedIndex > 0 ? () => setSelectedIndex((i) => (i ?? 0) - 1) : undefined}
          onNext={selectedIndex !== null && selectedIndex < visibleMedia.length - 1 ? () => setSelectedIndex((i) => (i ?? 0) + 1) : undefined}
          position={selectedIndex !== null ? { current: selectedIndex + 1, total: visibleMedia.length } : undefined}
        />
      )}
    </div>
  );
}
