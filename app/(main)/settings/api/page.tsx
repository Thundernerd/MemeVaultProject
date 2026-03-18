'use client';

import { useEffect, useState } from 'react';
import { Settings } from '@/components/settings/types';
import { EnvBadge } from '@/components/settings/EnvBadge';

export default function ApiSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setSettings);
  }, []);

  const envKeys = settings?._overridden_by_env ?? [];
  const isEnv = (key: string) => envKeys.includes(key);

  async function handleRegenKey() {
    if (isEnv('api_key')) return;
    if (!confirm('Regenerate API key? This will invalidate the existing key.')) return;
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerate_api_key: 'true' }),
    });
    const updated = await res.json();
    setSettings(updated);
  }

  async function copyKey() {
    if (!settings?.api_key) return;
    await navigator.clipboard.writeText(settings.api_key);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  }

  if (!settings) return <div className="text-zinc-500 text-sm">Loading…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white">External API Key</h2>
          {isEnv('api_key') && <EnvBadge />}
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          Use this key in the <code className="text-zinc-300">X-API-Key</code> header when
          calling <code className="text-zinc-300">/api/v1/*</code> endpoints.
        </p>
        {isEnv('api_key') && (
          <p className="text-xs text-amber-400/80 mt-1">
            Set via <code className="font-mono">MEMEVAULTPROJECT_API_KEY</code>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <code className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 truncate font-mono">
          {showKey ? settings.api_key : '•'.repeat(36)}
        </code>
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
        >
          {showKey ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          onClick={copyKey}
          className="text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
        >
          {apiKeyCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {!isEnv('api_key') && (
        <button
          type="button"
          onClick={handleRegenKey}
          className="self-start text-xs px-4 py-2 bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded-lg transition-colors"
        >
          Regenerate key
        </button>
      )}
    </div>
  );
}
