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
      <div className="flex flex-col gap-2">
        <div className="relative">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a URL to download…"
            required
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-4 pr-10 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                setUrl(text);
              } catch {}
            }}
            aria-label="Paste from clipboard"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 rounded transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="8" height="11" rx="1.5" />
              <path d="M3 4H2.5A1.5 1.5 0 0 0 1 5.5v8A1.5 1.5 0 0 0 2.5 15h6A1.5 1.5 0 0 0 10 13.5V13" />
            </svg>
          </button>
        </div>
        <select
          value={downloader}
          onChange={(e) => setDownloader(e.target.value as 'ytdlp' | 'gallery-dl')}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500"
        >
          <option value="ytdlp">Video (yt-dlp)</option>
          <option value="gallery-dl">Images (gallery-dl)</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-green-400 text-sm">Added to queue.</p>}
    </form>
  );
}
