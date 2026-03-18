'use client';

import { useEffect, useState } from 'react';
import { Settings } from '@/components/settings/types';
import { Field } from '@/components/settings/Field';
import { EnvBadge } from '@/components/settings/EnvBadge';

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setSettings);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="text-zinc-500 text-sm">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <Field
        label="Download location"
        envVar="MEMEVAULTPROJECT_DOWNLOAD_PATH"
        hint="Absolute path where files will be saved"
        value={settings.download_path}
        disabled={isEnv('download_path')}
        onChange={(v) => setSettings({ ...settings, download_path: v })}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-300">Max concurrent downloads</label>
          {isEnv('max_concurrent_downloads') && <EnvBadge />}
        </div>
        <select
          value={settings.max_concurrent_downloads}
          disabled={isEnv('max_concurrent_downloads')}
          onChange={(e) => setSettings({ ...settings, max_concurrent_downloads: e.target.value })}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 w-32 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </select>
        {isEnv('max_concurrent_downloads') && (
          <p className="text-xs text-amber-400/80">
            Set via <code className="font-mono">MEMEVAULTPROJECT_MAX_CONCURRENT_DOWNLOADS</code>
          </p>
        )}
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
