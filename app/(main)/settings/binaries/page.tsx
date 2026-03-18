'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings, BinariesState } from '@/components/settings/types';
import { Field } from '@/components/settings/Field';
import { BinaryCard } from '@/components/settings/BinaryCard';

export default function BinariesSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [binaries, setBinaries] = useState<BinariesState>({ ytdlp: null, 'gallery-dl': null, ffmpeg: null });
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadError, setDownloadError] = useState<Record<string, string>>({});

  const refreshBinaries = useCallback(async () => {
    const res = await fetch('/api/binaries');
    setBinaries(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/binaries').then((r) => r.json()),
    ]).then(([s, b]) => {
      setSettings(s);
      setBinaries(b);
    });
  }, []);

  const envKeys = settings?._overridden_by_env ?? [];
  const isEnv = (key: string) => envKeys.includes(key);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refreshBinaries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadBinary(name: 'ytdlp' | 'gallery-dl' | 'ffmpeg') {
    setDownloading((d) => ({ ...d, [name]: true }));
    setDownloadError((e) => ({ ...e, [name]: '' }));
    try {
      const res = await fetch(`/api/binaries/${name}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Download failed');
      await refreshBinaries();
    } catch (err) {
      setDownloadError((e) => ({
        ...e,
        [name]: err instanceof Error ? err.message : 'Unknown error',
      }));
    } finally {
      setDownloading((d) => ({ ...d, [name]: false }));
    }
  }

  if (!settings) return <div className="text-zinc-500 text-sm">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <Field
        label="Extra yt-dlp arguments"
        envVar="MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS"
        hint="Appended to every yt-dlp invocation (e.g. --no-playlist)"
        value={settings.ytdlp_extra_args}
        disabled={isEnv('ytdlp_extra_args')}
        onChange={(v) => setSettings({ ...settings, ytdlp_extra_args: v })}
      />
      <Field
        label="Extra gallery-dl arguments"
        envVar="MEMEVAULTPROJECT_GALLERYDL_EXTRA_ARGS"
        hint="Appended to every gallery-dl invocation"
        value={settings.gallerydl_extra_args}
        disabled={isEnv('gallerydl_extra_args')}
        onChange={(v) => setSettings({ ...settings, gallerydl_extra_args: v })}
      />

      <div className="border-t border-zinc-800 pt-5 flex flex-col gap-4">
        <p className="text-zinc-500 text-sm">
          Meme Vault Project auto-downloads yt-dlp, gallery-dl and ffmpeg to{' '}
          <code className="text-zinc-300">~/.memevaultproject/bin/</code> on first run.
          Leave the path override blank to use the auto-managed binary.
        </p>

        <BinaryCard
          label="yt-dlp"
          name="ytdlp"
          envVar="MEMEVAULTPROJECT_YTDLP_BIN"
          status={binaries.ytdlp}
          overridePath={settings.ytdlp_bin}
          overrideDisabled={isEnv('ytdlp_bin')}
          onOverrideChange={(v) => setSettings({ ...settings, ytdlp_bin: v })}
          downloading={!!downloading['ytdlp']}
          downloadError={downloadError['ytdlp'] ?? ''}
          onDownload={() => handleDownloadBinary('ytdlp')}
        />

        <BinaryCard
          label="gallery-dl"
          name="gallery-dl"
          envVar="MEMEVAULTPROJECT_GALLERYDL_BIN"
          status={binaries['gallery-dl']}
          overridePath={settings.gallerydl_bin}
          overrideDisabled={isEnv('gallerydl_bin')}
          onOverrideChange={(v) => setSettings({ ...settings, gallerydl_bin: v })}
          downloading={!!downloading['gallery-dl']}
          downloadError={downloadError['gallery-dl'] ?? ''}
          onDownload={() => handleDownloadBinary('gallery-dl')}
        />

        <BinaryCard
          label="ffmpeg"
          name="ffmpeg"
          envVar="MEMEVAULTPROJECT_FFMPEG_BIN"
          status={binaries.ffmpeg}
          overridePath={settings.ffmpeg_bin}
          overrideDisabled={isEnv('ffmpeg_bin')}
          onOverrideChange={(v) => setSettings({ ...settings, ffmpeg_bin: v })}
          downloading={!!downloading['ffmpeg']}
          downloadError={downloadError['ffmpeg'] ?? ''}
          onDownload={() => handleDownloadBinary('ffmpeg')}
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && <p className="text-green-400 text-sm">Settings saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="self-start bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
