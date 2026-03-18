'use client';

import { useEffect, useState } from 'react';

interface ApiKeyRecord {
  id: string;
  name: string;
  permission: 'read' | 'read_write';
  created_at: string;
  last_used_at: string | null;
}

interface NewKeyResult extends ApiKeyRecord {
  key: string;
}

function PermissionBadge({ permission }: { permission: 'read' | 'read_write' }) {
  return permission === 'read_write' ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
      read+write
    </span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 font-mono">
      read
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ApiSettingsPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [envKeyActive, setEnvKeyActive] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<NewKeyResult | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPermission, setFormPermission] = useState<'read' | 'read_write'>('read_write');
  const [saving, setSaving] = useState(false);

  async function loadKeys() {
    const res = await fetch('/api/api-keys');
    const data = await res.json();
    setKeys(data);
  }

  useEffect(() => {
    loadKeys();
    // Check if legacy env key is active by hitting settings
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setEnvKeyActive(s._overridden_by_env?.includes('api_key') ?? false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName.trim(), permission: formPermission }),
    });
    const created: NewKeyResult = await res.json();
    setSaving(false);
    setNewKeyResult(created);
    setShowForm(false);
    setFormName('');
    setFormPermission('read_write');
    await loadKeys();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
    await loadKeys();
  }

  async function copyNewKey() {
    if (!newKeyResult) return;
    await navigator.clipboard.writeText(newKeyResult.key);
    setNewKeyCopied(true);
    setTimeout(() => setNewKeyCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">API Keys</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Use the <code className="text-zinc-300">X-API-Key</code> header when calling{' '}
            <code className="text-zinc-300">/api/v1/*</code> endpoints.{' '}
            <span className="text-zinc-600">Read-only keys can access status and download. Read+write keys can also submit new downloads.</span>
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setNewKeyResult(null); }}
            className="shrink-0 text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
          >
            + New key
          </button>
        )}
      </div>

      {/* One-time key reveal */}
      {newKeyResult && (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-4 flex flex-col gap-2">
          <p className="text-sm text-emerald-400 font-medium">
            Key created — copy it now. It won&apos;t be shown again.
          </p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 truncate font-mono">
              {newKeyResult.key}
            </code>
            <button
              type="button"
              onClick={copyNewKey}
              className="shrink-0 text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
            >
              {newKeyCopied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setNewKeyResult(null)}
              className="shrink-0 text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-500 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-zinc-300">New API key</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Name</label>
            <input
              type="text"
              placeholder="e.g. Home Assistant"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Permission</label>
            <div className="flex gap-3">
              {(['read_write', 'read'] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="permission"
                    value={p}
                    checked={formPermission === p}
                    onChange={() => setFormPermission(p)}
                    className="accent-blue-500"
                  />
                  <span className="text-sm text-zinc-300">
                    {p === 'read_write' ? 'Read + Write' : 'Read only'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="text-xs px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              {saving ? 'Creating…' : 'Create key'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormName(''); setFormPermission('read_write'); }}
              className="text-xs px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Keys table */}
      <div className="flex flex-col gap-1">
        {envKeyActive && (
          <div className="flex items-center justify-between px-3 py-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm text-zinc-300 truncate">Legacy env key</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">env</span>
              <PermissionBadge permission="read_write" />
            </div>
            <span className="text-xs text-zinc-600">Set via MEMEVAULTPROJECT_API_KEY</span>
          </div>
        )}

        {keys.length === 0 && !envKeyActive && (
          <p className="text-sm text-zinc-600 py-2">No API keys yet.</p>
        )}

        {keys.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between px-3 py-3 rounded-lg bg-zinc-900 border border-zinc-800 gap-3"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-sm text-zinc-200 truncate">{k.name}</span>
              <PermissionBadge permission={k.permission} />
            </div>
            <div className="shrink-0 flex items-center gap-4 text-xs text-zinc-600">
              <span>Created {formatDate(k.created_at)}</span>
              <span>Last used {formatDate(k.last_used_at)}</span>
              <button
                type="button"
                onClick={() => handleDelete(k.id, k.name)}
                className="text-red-500/70 hover:text-red-400 transition-colors"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
