'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import AddUrlForm from '@/components/AddUrlForm';
import QueueItemRow from '@/components/QueueItem';
import type { QueueItem } from '@/lib/db';

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error('Failed to load queue');
      const data = await res.json();
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    intervalRef.current = setInterval(fetchQueue, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchQueue]);

  const active = items.filter((i) => i.status === 'pending' || i.status === 'downloading');
  const done = items.filter((i) => i.status === 'completed' || i.status === 'failed');

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Queue</h1>
        <p className="text-zinc-500 text-sm">
          {active.length} active · {done.length} completed
        </p>
      </div>

      <AddUrlForm onAdded={fetchQueue} />

      {loading && <div className="text-zinc-500 text-sm">Loading…</div>}

      {!loading && error && (
        <div className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-3">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-600">
          <span className="text-4xl">📋</span>
          <p className="text-sm">Queue is empty. Paste a URL above to get started.</p>
        </div>
      )}

      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Active</h2>
          {active.map((item) => (
            <QueueItemRow key={item.id} item={item} onRemoved={fetchQueue} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">History</h2>
          {done.map((item) => (
            <QueueItemRow key={item.id} item={item} onRemoved={fetchQueue} />
          ))}
        </section>
      )}
    </div>
  );
}
