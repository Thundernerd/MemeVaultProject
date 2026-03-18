import { BinaryStatus } from './types';
import { EnvBadge } from './EnvBadge';

export function BinaryCard({
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
          {downloading ? 'Downloading…' : status?.exists ? 'Update' : 'Download'}
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
