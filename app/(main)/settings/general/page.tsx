'use client';

import { useEffect, useState } from 'react';
import { Settings } from '@/components/settings/types';
import { Field } from '@/components/settings/Field';

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
