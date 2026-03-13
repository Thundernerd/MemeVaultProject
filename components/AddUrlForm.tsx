'use client';

import { useState } from 'react';

interface Props {
  onAdded?: () => void;
}

export default function AddUrlForm({ onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [downloader, setDownloader] = useState<'ytdlp' | 'gallery-dl'>('ytdlp');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), downloader }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to add');
      }
      setUrl('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a URL to download…"
          required
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <select
          value={downloader}
          onChange={(e) => setDownloader(e.target.value as 'ytdlp' | 'gallery-dl')}
          className="w-full sm:w-auto bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500"
        >
          <option value="ytdlp">Video (yt-dlp)</option>
          <option value="gallery-dl">Images (gallery-dl)</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-green-400 text-sm">Added to queue.</p>}
    </form>
  );
}
