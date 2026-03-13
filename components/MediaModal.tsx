'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Tag, MediaItemWithTags } from '@/lib/db';

// Re-exported for consumers that imported this type from this module.
export type { MediaItemWithTags as ModalMediaItem };

interface Props {
  item: MediaItemWithTags;
  onClose: () => void;
  onDeleted: () => void;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function MediaModal({ item, onClose, onDeleted }: Props) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Tag state
  const [tags, setTags] = useState<Tag[]>(item.tags ?? []);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const fileSrc = `/api/media/${item.id}/file`;
  const thumbnailSrc = item.thumbnail_path ? `/api/media/${item.id}/thumbnail` : null;

  // Close on Escape
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  useEffect(() => {
    fetch('/api/tags')
      .then((r) => r.json())
      .then((data: Tag[]) => setAllTags(data))
      .catch(() => {});
  }, []);

  // Filter suggestions as the user types
  useEffect(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) {
      setTagSuggestions([]);
      return;
    }
    const current = new Set(tags.map((t) => t.name.toLowerCase()));
    setTagSuggestions(
      allTags.filter(
        (t) => t.name.toLowerCase().includes(q) && !current.has(t.name.toLowerCase())
      )
    );
  }, [tagInput, allTags, tags]);

  async function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      return;
    }
    try {
      const res = await fetch(`/api/media/${item.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tag: Tag = await res.json();
      setTags((prev) => [...prev, tag]);
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    } catch { /* ignore */ }
    setTagInput('');
    setTagSuggestions([]);
  }

  async function removeTag(tagId: string) {
    const previous = tags;
    const current = tags.filter((t) => t.id !== tagId);
    setTags(current);
    try {
      const res = await fetch(`/api/media/${item.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: current.map((t) => t.name) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setTags(previous);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item and its files from disk?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
      onClose();
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const displayTitle = item.title ?? item.file_path.split('/').pop() ?? item.file_path;
  const desc = item.description ?? '';
  const isLongDesc = desc.length > 300;

  const metadata: { label: string; value: string | null }[] = [
    { label: 'Uploader', value: item.uploader },
    { label: 'Duration', value: item.duration ? formatDuration(item.duration) : null },
    {
      label: 'Resolution',
      value: item.width && item.height ? `${item.width}×${item.height}` : null,
    },
    { label: 'Format', value: item.format ? item.format.toUpperCase() : null },
    { label: 'File size', value: item.file_size ? formatBytes(item.file_size) : null },
    {
      label: 'Added',
      value: new Date(item.created_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    },
  ].filter((r) => r.value !== null);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* Modal panel — stop propagation so clicks inside don't close */}
      <div
        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Media area */}
        <div className="bg-black flex items-center justify-center" style={{ maxHeight: '60vh' }}>
          {item.type === 'video' ? (
            <video
              src={fileSrc}
              controls
              autoPlay
              poster={thumbnailSrc ?? undefined}
              className="w-full object-contain"
              style={{ maxHeight: '60vh' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc ?? fileSrc}
              alt={displayTitle}
              className="object-contain w-full"
              style={{ maxHeight: '60vh' }}
              onError={(e) => {
                if (thumbnailSrc && e.currentTarget.src !== fileSrc) {
                  e.currentTarget.src = fileSrc;
                }
              }}
            />
          )}
        </div>

        {/* Scrollable info panel */}
        <div className="overflow-y-auto flex flex-col gap-4 p-5">
          {/* Title */}
          <h2 className="text-lg font-semibold text-white leading-snug pr-8">{displayTitle}</h2>

          {/* Source URL */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 truncate transition-colors"
              title={item.url}
            >
              {item.url}
            </a>
          )}

          {/* Description */}
          {desc && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Description</p>
              <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
                {isLongDesc && !descExpanded ? desc.slice(0, 300) + '…' : desc}
              </p>
              {isLongDesc && (
                <button
                  onClick={() => setDescExpanded((v) => !v)}
                  className="self-start text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {descExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {/* Tags editor */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Tags</p>

            {/* Current tags */}
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-900/50 text-indigo-300 text-xs font-medium"
                >
                  {tag.name}
                  <button
                    onClick={() => removeTag(tag.id)}
                    className="text-indigo-400 hover:text-white transition-colors leading-none"
                    aria-label={`Remove tag ${tag.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-zinc-600 italic">No tags yet</span>
              )}
            </div>

            {/* Add tag input with autocomplete */}
            <div className="relative">
              <div className="flex gap-2">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder="Add a tag…"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <button
                  onClick={() => addTag(tagInput)}
                  disabled={!tagInput.trim()}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              {/* Suggestions dropdown */}
              {tagSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-10">
                  {tagSuggestions.slice(0, 8).map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => addTag(tag.name)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Metadata grid */}
          {metadata.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {metadata.map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">{label}</span>
                  <span className="text-zinc-200">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Divider + actions */}
          <div className="border-t border-zinc-800 pt-3 flex gap-2">
            <a
              href={fileSrc}
              download
              className="flex-1 text-center text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded-lg transition-colors"
            >
              Download
            </a>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 text-sm bg-red-900/40 hover:bg-red-800/60 text-red-400 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
