'use client';

import { useEffect, useState } from 'react';
import { CookiesState } from '@/components/settings/types';
import { CookieCard } from '@/components/settings/CookieCard';

export default function CookiesSettingsPage() {
  const [cookies, setCookies] = useState<CookiesState>({ ytdlp: null, gallerydl: null });
  const [cookieUploading, setCookieUploading] = useState<Record<string, boolean>>({});
  const [cookieError, setCookieError] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch('/api/cookies/ytdlp').then((r) => r.json()),
      fetch('/api/cookies/gallerydl').then((r) => r.json()),
    ]).then(([cy, cg]) => {
      setCookies({ ytdlp: cy, gallerydl: cg });
    });
  }, []);

  async function handleCookieUpload(tool: 'ytdlp' | 'gallerydl', file: File) {
    setCookieUploading((u) => ({ ...u, [tool]: true }));
    setCookieError((e) => ({ ...e, [tool]: '' }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/cookies/${tool}`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setCookies((c) => ({ ...c, [tool]: data }));
    } catch (err) {
      setCookieError((e) => ({ ...e, [tool]: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setCookieUploading((u) => ({ ...u, [tool]: false }));
    }
  }

  async function handleCookieDelete(tool: 'ytdlp' | 'gallerydl') {
    setCookieError((e) => ({ ...e, [tool]: '' }));
    const res = await fetch(`/api/cookies/${tool}`, { method: 'DELETE' });
    const data = await res.json();
    setCookies((c) => ({ ...c, [tool]: data }));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-zinc-500 text-sm">
        Some sites (e.g. Instagram) require authentication cookies to download content.
        Export a <code className="text-zinc-300">cookies.txt</code> file in Netscape format
        using a browser extension such as{' '}
        <span className="text-zinc-300">Get cookies.txt LOCALLY</span>, then upload it here.
      </p>

      <CookieCard
        label="yt-dlp"
        tool="ytdlp"
        status={cookies.ytdlp}
        uploading={!!cookieUploading['ytdlp']}
        error={cookieError['ytdlp'] ?? ''}
        onUpload={(file) => handleCookieUpload('ytdlp', file)}
        onDelete={() => handleCookieDelete('ytdlp')}
      />

      <CookieCard
        label="gallery-dl"
        tool="gallerydl"
        status={cookies.gallerydl}
        uploading={!!cookieUploading['gallerydl']}
        error={cookieError['gallerydl'] ?? ''}
        onUpload={(file) => handleCookieUpload('gallerydl', file)}
        onDelete={() => handleCookieDelete('gallerydl')}
      />
    </div>
  );
}
