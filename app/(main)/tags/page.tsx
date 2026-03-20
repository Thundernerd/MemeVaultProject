'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { TagWithCount } from '@/lib/db';

const NAMESPACE_ORDER = ['type', 'platform', 'date', 'format', 'uploader'];
const NAMESPACE_LABELS: Record<string, string> = {
  type: 'Type',
  platform: 'Platform',
  date: 'Date',
  format: 'Format',
  uploader: 'Uploader',
};

export default function TagsPage() {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [purgingOrphans, setPurgingOrphans] = useState(false);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('Failed to load tags');
      setTags(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  async function deleteTag(id: string) {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await fetch('/api/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setTags((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function purgeOrphans() {
    const orphans = tags.filter((t) => t.usage_count === 0);
    if (orphans.length === 0) return;
    setPurgingOrphans(true);
    try {
      await Promise.all(
        orphans.map((t) =>
          fetch('/api/tags', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: t.id }),
          })
        )
      );
      setTags((prev) => prev.filter((t) => t.usage_count > 0));
    } finally {
      setPurgingOrphans(false);
    }
  }

  const groupedTags = useMemo(() => {
    const groups: Record<string, TagWithCount[]> = {};
    for (const tag of tags) {
      const colon = tag.name.indexOf(':');
      const ns = colon > 0 ? tag.name.slice(0, colon) : 'other';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(tag);
    }
    return groups;
  }, [tags]);

  const orderedNamespaces = useMemo(() => {
    const known = NAMESPACE_ORDER.filter((ns) => groupedTags[ns]?.length > 0);
    const custom = Object.keys(groupedTags).filter(
      (ns) => !NAMESPACE_ORDER.includes(ns) && ns !== 'other'
    );
    const hasOther = (groupedTags['other']?.length ?? 0) > 0;
    return [...known, ...custom, ...(hasOther ? ['other'] : [])];
  }, [groupedTags]);

  const orphanCount = tags.filter((t) => t.usage_count === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary">Tags</h1>
          <p className="text-text-muted text-sm">
            {tags.length} tag{tags.length !== 1 ? 's' : ''}
            {orphanCount > 0 && (
              <span className="text-amber-500"> · {orphanCount} orphaned</span>
            )}
          </p>
        </div>
        {orphanCount > 0 && (
          <button
            onClick={purgeOrphans}
            disabled={purgingOrphans}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition-colors"
          >
            {purgingOrphans ? 'Purging…' : `Purge ${orphanCount} orphaned`}
          </button>
        )}
      </div>

      {loading && <p className="text-text-muted text-sm">Loading…</p>}

      {!loading && error && (
        <div className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-3">{error}</div>
      )}

      {!loading && !error && tags.length === 0 && (
        <p className="text-text-muted text-sm">No tags yet.</p>
      )}

      {!loading && !error && orderedNamespaces.map((ns) => {
        const nsTags = groupedTags[ns] ?? [];
        const label =
          NAMESPACE_LABELS[ns] ??
          (ns === 'other' ? 'Other' : ns.charAt(0).toUpperCase() + ns.slice(1));

        return (
          <div key={ns} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</h2>
            <div className="flex flex-wrap gap-2">
              {nsTags.map((tag) => {
                const colon = tag.name.indexOf(':');
                const displayName = colon > 0 ? tag.name.slice(colon + 1) : tag.name;
                const orphan = tag.usage_count === 0;
                return (
                  <div
                    key={tag.id}
                    className={`flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-xs font-medium ${
                      orphan
                        ? 'bg-surface-2/60 text-text-muted border border-border'
                        : 'bg-surface-2 text-text-secondary'
                    }`}
                  >
                    <span>{displayName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        orphan ? 'bg-surface-3/50 text-text-muted' : 'bg-surface-3 text-text-secondary'
                      }`}
                    >
                      {tag.usage_count}
                    </span>
                    <button
                      onClick={() => deleteTag(tag.id)}
                      disabled={deleting.has(tag.id)}
                      aria-label={`Delete tag ${displayName}`}
                      className="text-text-muted hover:text-red-400 disabled:opacity-40 transition-colors p-0.5 rounded-full"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 2l8 8M10 2L2 10" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
