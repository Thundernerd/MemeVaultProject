'use client';

import { useEffect, useState } from 'react';
import { Settings } from '@/components/settings/types';

export default function DiscordSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setSettings);
  }, []);

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
        body: JSON.stringify({
          discord_enabled: settings.discord_enabled,
          discord_bot_token: settings.discord_bot_token,
          discord_client_id: settings.discord_client_id,
          discord_command_name: settings.discord_command_name,
        }),
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

  const enabled = settings.discord_enabled === 'true';

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-text-muted">
          Run a Discord bot that lets you download media and post it directly in a channel via a slash command.
          The bot starts automatically when the app starts and restarts whenever these settings are saved.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="discord_enabled"
          checked={enabled}
          onChange={(e) =>
            setSettings({ ...settings, discord_enabled: e.target.checked ? 'true' : 'false' })
          }
          className="w-4 h-4 rounded accent-accent"
        />
        <label htmlFor="discord_enabled" className="text-sm font-medium text-text-secondary">
          Enable Discord bot
        </label>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text-secondary">Bot token</label>
        <p className="text-xs text-text-muted">
          Found in the Discord Developer Portal under your application → Bot → Token.
        </p>
        <input
          type="password"
          value={settings.discord_bot_token ?? ''}
          onChange={(e) => setSettings({ ...settings, discord_bot_token: e.target.value })}
          placeholder="MTExxx…"
          className="bg-surface-2 border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong font-mono"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text-secondary">Application / Client ID</label>
        <p className="text-xs text-text-muted">
          Found in the Discord Developer Portal under your application → General Information → Application ID.
          Required to register the slash command.
        </p>
        <input
          type="text"
          value={settings.discord_client_id ?? ''}
          onChange={(e) => setSettings({ ...settings, discord_client_id: e.target.value })}
          placeholder="123456789012345678"
          className="bg-surface-2 border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong font-mono"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text-secondary">Slash command name</label>
        <p className="text-xs text-text-muted">
          The name of the slash command (without the <code className="text-text-secondary">/</code>).
          Defaults to <code className="text-text-secondary">get</code>. Must be lowercase with no spaces.
          Changes take up to 1 hour to propagate globally on Discord.
        </p>
        <input
          type="text"
          value={settings.discord_command_name ?? ''}
          onChange={(e) =>
            setSettings({ ...settings, discord_command_name: e.target.value.toLowerCase().replace(/\s+/g, '-') })
          }
          placeholder="get"
          className="bg-surface-2 border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong w-48"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && (
        <p className="text-green-400 text-sm">
          Settings saved. The bot will restart with the new configuration.
        </p>
      )}

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
