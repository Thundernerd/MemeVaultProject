'use client';

import { useEffect, useState } from 'react';
import { Settings } from '@/components/settings/types';
import { EnvBadge } from '@/components/settings/EnvBadge';

export default function SharingSettingsPage() {
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

  if (!settings) return <div className="text-text-muted text-sm">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* Random endpoint mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text-secondary">Random endpoint mode</label>
        <p className="text-xs text-text-muted">
          Controls which items <code className="text-text-secondary">GET /api/v1/random</code> picks from.
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="random_mode"
              value="flag"
              checked={settings.random_mode === 'flag'}
              onChange={() => setSettings({ ...settings, random_mode: 'flag' })}
              className="accent-accent"
            />
            <span className="text-sm text-text-secondary">
              <span className="font-medium">Flagged items</span>
              <span className="text-text-muted"> — only items with the &ldquo;Include in random&rdquo; toggle enabled</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="random_mode"
              value="shared"
              checked={settings.random_mode === 'shared'}
              onChange={() => setSettings({ ...settings, random_mode: 'shared' })}
              className="accent-accent"
            />
            <span className="text-sm text-text-secondary">
              <span className="font-medium">Shared items</span>
              <span className="text-text-muted"> — all items that have at least one active share link</span>
            </span>
          </label>
        </div>
      </div>

      <div className="border-t border-border" />

      <p className="text-text-muted text-sm">
        Default options applied when creating a new share link from the media viewer.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text-secondary">Default link expiry</label>
        <select
          value={settings.share_default_expiry_days}
          onChange={(e) => setSettings({ ...settings, share_default_expiry_days: e.target.value })}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-border-strong w-48"
        >
          <option value="">Never expires</option>
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="share_default_allow_download"
          checked={settings.share_default_allow_download === '1'}
          onChange={(e) =>
            setSettings({ ...settings, share_default_allow_download: e.target.checked ? '1' : '0' })
          }
          className="w-4 h-4 rounded accent-accent"
        />
        <label htmlFor="share_default_allow_download" className="text-sm text-text-secondary">
          Allow download by default
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-text-secondary">Public base URL</label>
          {isEnv('share_base_url') && <EnvBadge />}
        </div>
        <p className="text-xs text-text-muted">
          Required for Discord/WhatsApp embeds. The public-facing URL of this instance,
          e.g. <code className="text-text-secondary">https://memes.example.com</code>. Leave blank to disable OG embeds.
        </p>
        <input
          type="url"
          value={settings.share_base_url}
          disabled={isEnv('share_base_url')}
          onChange={(e) => setSettings({ ...settings, share_base_url: e.target.value })}
          placeholder="https://memes.example.com"
          className="bg-surface-2 border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {isEnv('share_base_url') && (
          <p className="text-xs text-amber-400/80">
            Set via <code className="font-mono">MEMEVAULTPROJECT_SHARE_BASE_URL</code>
          </p>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && <p className="text-green-400 text-sm">Settings saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="self-start bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
