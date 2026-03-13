'use client';

import { useEffect, useState, useCallback } from 'react';

interface Settings {
  download_path: string;
  ytdlp_extra_args: string;
  gallerydl_extra_args: string;
  max_concurrent_downloads: string;
  api_key: string;
  ytdlp_bin: string;
  gallerydl_bin: string;
  ffmpeg_bin: string;
  _overridden_by_env: string[];
}

interface BinaryStatus {
  name: string;
  path: string;
  exists: boolean;
  version: string | null;
}

interface BinariesState {
  ytdlp: BinaryStatus | null;
  'gallery-dl': BinaryStatus | null;
  ffmpeg: BinaryStatus | null;
}

function EnvBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
      env
    </span>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [binaries, setBinaries] = useState<BinariesState>({ ytdlp: null, 'gallery-dl': null, ffmpeg: null });
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadError, setDownloadError] = useState<Record<string, string>>({});

  async function load() {
    const [settingsRes, binRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/binaries'),
    ]);
    setSettings(await settingsRes.json());
    setBinaries(await binRes.json());
  }

  const refreshBinaries = useCallback(async () => {
    const res = await fetch('/api/binaries');
    setBinaries(await res.json());
  }, []);

  useEffect(() => { load(); }, []);

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
    <div className="flex flex-col gap-6 max-w-xl pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Field
          label="Download location"
          envVar="MEMEVAULTPROJECT_DOWNLOAD_PATH"
          hint="Absolute path where files will be saved"
          value={settings.download_path}
          disabled={isEnv('download_path')}
          onChange={(v) => setSettings({ ...settings, download_path: v })}
        />
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

        {/* Binaries section */}
        <div className="border-t border-zinc-800 pt-6 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Binaries</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Meme Vault Project auto-downloads yt-dlp, gallery-dl and ffmpeg to{' '}
              <code className="text-zinc-300">~/.memevaultproject/bin/</code> on first run.
              Leave the path override blank to use the auto-managed binary.
            </p>
          </div>

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

        {/* API Key section */}
        <div className="border-t border-zinc-800 pt-6 flex flex-col gap-3">
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
    </div>
  );
}

function BinaryCard({
  label,
  name,
  envVar,
  status,
  overridePath,
  overrideDisabled,
  onOverrideChange,
  downloading,
  downloadError,
  onDownload,
}: {
  label: string;
  name: string;
  envVar: string;
  status: BinaryStatus | null;
  overridePath: string;
  overrideDisabled: boolean;
  onOverrideChange: (v: string) => void;
  downloading: boolean;
  downloadError: string;
  onDownload: () => void;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          {status ? (
            status.exists ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Found</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">Missing</span>
            )
          ) : (
            <span className="text-xs text-zinc-600">Checking…</span>
          )}
          {status?.version && (
            <span className="text-xs text-zinc-500">{status.version}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="text-xs px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
        >
          {downloading
            ? 'Downloading…'
            : status?.exists
            ? 'Update'
            : 'Download'}
        </button>
      </div>

      {status?.path && (
        <p className="text-xs text-zinc-600 font-mono truncate" title={status.path}>
          {status.path}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">
            Path override{' '}
            <span className="text-zinc-700">(leave blank to use auto-managed binary)</span>
          </label>
          {overrideDisabled && <EnvBadge />}
        </div>
        <input
          type="text"
          value={overridePath}
          disabled={overrideDisabled}
          onChange={(e) => onOverrideChange(e.target.value)}
          placeholder={`/usr/local/bin/${name === 'ytdlp' ? 'yt-dlp' : name}`}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {overrideDisabled && (
          <p className="text-xs text-amber-400/80">
            Set via <code className="font-mono">{envVar}</code>
          </p>
        )}
      </div>

      {downloadError && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{downloadError}</p>
      )}
    </div>
  );
}

function Field({
  label,
  envVar,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  envVar: string;
  hint?: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-300">{label}</label>
        {disabled && <EnvBadge />}
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {disabled && (
        <p className="text-xs text-amber-400/80">
          Set via <code className="font-mono">{envVar}</code>
        </p>
      )}
    </div>
  );
}
