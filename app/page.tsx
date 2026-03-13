'use client';

import { useEffect, useState, useCallback } from 'react';
import MediaCard from '@/components/MediaCard';
import type { Tag, MediaItemWithTags } from '@/lib/db';

type TagFilterMode = 'any' | 'all';

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItemWithTags[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagFilterMode>('any');

  const fetchMedia = useCallback(async () => {
    try {
      const [mediaRes, tagsRes] = await Promise.all([
        fetch('/api/media'),
        fetch('/api/tags'),
      ]);
      if (!mediaRes.ok || !tagsRes.ok) throw new Error('Failed to load library');
      const [mediaData, tagsData] = await Promise.all([mediaRes.json(), tagsRes.json()]);
      setItems(mediaData);
      setAllTags(tagsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const filtered = items.filter((item) => {
    if (filter !== 'all' && item.type !== filter) return false;
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
  });

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Vault</h1>
        <p className="text-zinc-500 text-sm">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Search + type filter row */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 w-64"
        />
        <div className="flex gap-1">
          {(['all', 'video', 'image'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                filter === f
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
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
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Filter by tag</span>
            <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
              {(['any', 'all'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setTagMode(m)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    tagMode === m
                      ? 'bg-zinc-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {m === 'any' ? 'Any' : 'All'}
                </button>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const active = selectedTags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.name)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-zinc-500 text-sm">Loading…</div>
      )}

      {!loading && error && (
        <div className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-3">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-600">
          <span className="text-5xl">📭</span>
          <p className="text-sm">No media yet. Add URLs from the Queue page.</p>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {filtered.map((item) => (
          <MediaCard key={item.id} item={item} onDeleted={fetchMedia} />
        ))}
      </div>
    </div>
  );
}
