'use client';

import { useState } from 'react';

interface QueueItemData {
  id: string;
  url: string;
  downloader: 'ytdlp' | 'gallery-dl';
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Props {
  item: QueueItemData;
  onRemoved: () => void;
}

const statusColors: Record<QueueItemData['status'], string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  downloading: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

export default function QueueItemRow({ item, onRemoved }: Props) {
  const [removing, setRemoving] = useState(false);

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate" title={item.url}>{item.url}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{hostname}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[item.status]}`}>
            {item.status}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
            {item.downloader === 'ytdlp' ? 'yt-dlp' : 'gallery-dl'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {(item.status === 'downloading' || item.status === 'completed') && (
        <div className="w-full bg-zinc-800 rounded-full h-1.5">
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
        <span className="text-xs text-zinc-600">
          {new Date(item.created_at).toLocaleString()}
        </span>
        {item.status !== 'downloading' && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}
