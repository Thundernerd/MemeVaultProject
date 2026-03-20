'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import MediaCard from '@/components/MediaCard';
import AlbumCard from '@/components/AlbumCard';
import SkeletonCard from '@/components/SkeletonCard';
import AddUrlModal from '@/components/AddUrlModal';
import type { Tag, MediaItemWithTags, AlbumWithMedia, QueueItem } from '@/lib/db';

type TagFilterMode = 'any' | 'all';

const NAMESPACE_ORDER = ['type', 'platform', 'date', 'format', 'uploader'];
const NAMESPACE_LABELS: Record<string, string> = {
  type: 'Type',
  platform: 'Platform',
  date: 'Date',
  format: 'Format',
  uploader: 'Uploader',
};

type VaultEntry =
  | { kind: 'media'; item: MediaItemWithTags }
  | { kind: 'album'; album: AlbumWithMedia };

export default function LibraryPage() {
  const [mediaItems, setMediaItems] = useState<MediaItemWithTags[]>([]);
  const [albums, setAlbums] = useState<AlbumWithMedia[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagFilterMode>('any');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [activeQueueItems, setActiveQueueItems] = useState<QueueItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const fetchMedia = useCallback(async () => {
    try {
      const [mediaRes, albumsRes, tagsRes] = await Promise.all([
        fetch('/api/media'),
        fetch('/api/albums'),
        fetch('/api/tags'),
      ]);
      if (!mediaRes.ok || !albumsRes.ok || !tagsRes.ok) throw new Error('Failed to load library');
      const [mediaData, albumsData, tagsData] = await Promise.all([
        mediaRes.json(),
        albumsRes.json(),
        tagsRes.json(),
      ]);
      setMediaItems(mediaData);
      setAlbums(albumsData);
      setAllTags(tagsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    const res = await fetch('/api/queue');
    if (!res.ok) return;
    const items: QueueItem[] = await res.json();
    const active = items.filter((i) => i.status === 'pending' || i.status === 'downloading');
    setActiveQueueItems((prev) => {
      if (prev.length > active.length) fetchMedia();
      return active;
    });
  }, [fetchMedia]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 2000);
    return () => clearInterval(id);
  }, [fetchQueue]);

  // Merge media and albums into a single sorted list
  const entries = useMemo<VaultEntry[]>(
    () =>
      [
        ...mediaItems.map((item): VaultEntry => ({ kind: 'media', item })),
        ...albums.map((album): VaultEntry => ({ kind: 'album', album })),
      ].sort((a, b) => {
        const aDate = a.kind === 'media' ? a.item.created_at : a.album.created_at;
        const bDate = b.kind === 'media' ? b.item.created_at : b.album.created_at;
        return bDate.localeCompare(aDate);
      }),
    [mediaItems, albums]
  );

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (entry.kind === 'media') {
          const item = entry.item;
          if (filter === 'video' && item.type !== 'video') return false;
          if (filter === 'image' && item.type !== 'image') return false;
          if (search && !item.title?.toLowerCase().includes(search.toLowerCase())) return false;
          if (selectedTags.length > 0) {
            const itemTagNames = item.tags.map((t) => t.name);
            if (tagMode === 'all') {
              if (!selectedTags.every((t) => itemTagNames.includes(t))) return false;
            } else {
              if (!selectedTags.some((t) => itemTagNames.includes(t))) return false;
            }
          }
          return true;
        } else {
          const album = entry.album;
          // Albums are image-type; hide under video filter
          if (filter === 'video') return false;
          if (search) {
            const q = search.toLowerCase();
            const matchTitle = album.title?.toLowerCase().includes(q) ?? false;
            const matchUploader = album.uploader?.toLowerCase().includes(q) ?? false;
            if (!matchTitle && !matchUploader) return false;
          }
          if (selectedTags.length > 0) {
            const albumTagNames = new Set(
              album.media.flatMap((m) => m.tags.map((t) => t.name))
            );
            if (tagMode === 'all') {
              if (!selectedTags.every((t) => albumTagNames.has(t))) return false;
            } else {
              if (!selectedTags.some((t) => albumTagNames.has(t))) return false;
            }
          }
          return true;
        }
      }),
    [entries, filter, search, selectedTags, tagMode]
  );

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  const groupedTags = useMemo(() => {
    const groups: Record<string, Tag[]> = {};
    for (const tag of allTags) {
      const colon = tag.name.indexOf(':');
      const ns = colon > 0 ? tag.name.slice(0, colon) : 'other';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(tag);
    }
    return groups;
  }, [allTags]);

  const orderedNamespaces = useMemo(() => {
    const known = NAMESPACE_ORDER.filter((ns) => groupedTags[ns]?.length > 0);
    const custom = Object.keys(groupedTags).filter(
      (ns) => !NAMESPACE_ORDER.includes(ns) && ns !== 'other'
    );
    const hasOther = (groupedTags['other']?.length ?? 0) > 0;
    return [...known, ...custom, ...(hasOther ? ['other'] : [])];
  }, [groupedTags]);

  const totalCount = mediaItems.length + albums.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-primary">Vault</h1>
        <p className="text-text-muted text-sm">
          {totalCount} item{totalCount !== 1 ? 's' : ''}
          {activeQueueItems.length > 0 && ` · ${activeQueueItems.length} downloading`}
        </p>
      </div>

      {/* Search + type filter row */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong w-64"
        />
        <div className="flex gap-1">
          {(['all', 'video', 'image'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                filter === f
                  ? 'bg-accent-subtle text-accent'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setTagFilterOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                className={`transition-transform duration-200 ${tagFilterOpen ? 'rotate-180' : ''}`}
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              Filter by tag
              {selectedTags.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent text-white text-[10px] font-medium normal-case tracking-normal">
                  {selectedTags.length}
                </span>
              )}
            </button>
            {tagFilterOpen && (
              <>
                <div className="flex gap-1 bg-surface-2 rounded-lg p-0.5">
                  {(['any', 'all'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setTagMode(m)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        tagMode === m
                          ? 'bg-surface-3 text-text-primary'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {m === 'any' ? 'Any' : 'All'}
                    </button>
                  ))}
                </div>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Clear
                  </button>
                )}
              </>
            )}
          </div>
          {tagFilterOpen && <div className="flex flex-col gap-1.5">
            {orderedNamespaces.map((ns) => {
              const nsTags = groupedTags[ns] ?? [];
              const label =
                NAMESPACE_LABELS[ns] ??
                (ns === 'other' ? 'Other' : ns.charAt(0).toUpperCase() + ns.slice(1));
              return (
                <div key={ns} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-text-muted w-16 shrink-0 uppercase tracking-wider">
                    {label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {nsTags.map((tag) => {
                      const active = selectedTags.includes(tag.name);
                      const colon = tag.name.indexOf(':');
                      const displayName = colon > 0 ? tag.name.slice(colon + 1) : tag.name;
                      return (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.name)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            active
                              ? 'bg-accent text-white'
                              : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                          }`}
                        >
                          {displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>}
        </div>
      )}

      {loading && (
        <div className="text-text-muted text-sm">Loading…</div>
      )}

      {!loading && error && (
        <div className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-3">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && activeQueueItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
          <span className="text-5xl">📭</span>
          <p className="text-sm">No media yet. Add URLs from the Queue page.</p>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {activeQueueItems.map((item) => (
          <SkeletonCard key={item.id} status={item.status} progress={item.progress} />
        ))}
        {filtered.map((entry) =>
          entry.kind === 'media' ? (
            <MediaCard key={entry.item.id} item={entry.item} onDeleted={fetchMedia} />
          ) : (
            <AlbumCard key={entry.album.id} album={entry.album} onDeleted={fetchMedia} />
          )
        )}
      </div>

      {/* Floating action button — portalled to body to escape the page animation transform */}
      {mounted && createPortal(
        <>
          <button
            onClick={() => setAddModalOpen(true)}
            aria-label="Add URL"
            className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-accent hover:bg-accent-hover text-white shadow-lg flex items-center justify-center transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {addModalOpen && (
            <AddUrlModal
              onClose={() => setAddModalOpen(false)}
              onAdded={fetchMedia}
            />
          )}
        </>,
        document.body
      )}
    </div>
  );
}
