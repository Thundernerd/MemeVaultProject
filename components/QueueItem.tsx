'use client';

import { useState } from 'react';
import type { QueueItem } from '@/lib/db';

interface Props {
  item: QueueItem;
  onRemoved: () => void;
  onRetried?: () => void;
}

const statusColors: Record<QueueItem['status'], string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  downloading: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

export default function QueueItemRow({ item, onRemoved, onRetried }: Props) {
  const [removing, setRemoving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, downloader: item.downloader }),
      });
      onRetried?.();
    } finally {
      setRetrying(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await fetch(`/api/queue/${item.id}`, { method: 'DELETE' });
      onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  const hostname = (() => {
    try { return new URL(item.url).hostname; } catch { return item.url; }
  })();

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-2 animate-[page-enter_0.3s_ease-out_backwards]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate" title={item.url}>{item.url}</p>
          <p className="text-xs text-text-muted mt-0.5">{hostname}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[item.status]}`}>
            {item.status}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-text-secondary">
            {item.downloader === 'ytdlp' ? 'yt-dlp' : 'gallery-dl'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {(item.status === 'downloading' || item.status === 'completed') && (
        <div className="w-full bg-surface-2 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              item.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(item.progress, 100)}%` }}
          />
        </div>
      )}

      {item.error && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{item.error}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {new Date(item.created_at).toLocaleString()}
        </span>
        <div className="flex items-center gap-3">
          {item.status !== 'downloading' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="text-xs text-text-muted hover:text-accent transition-colors disabled:opacity-50"
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
          {item.status !== 'downloading' && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="text-xs text-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
