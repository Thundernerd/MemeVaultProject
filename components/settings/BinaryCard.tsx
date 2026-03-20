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
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {status ? (
            status.exists ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Found</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">Missing</span>
            )
          ) : (
            <span className="text-xs text-text-muted">Checking…</span>
          )}
          {status?.version && (
            <span className="text-xs text-text-muted">{status.version}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="text-xs px-3 py-1.5 bg-accent/80 hover:bg-accent disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
        >
          {downloading ? 'Downloading…' : status?.exists ? 'Update' : 'Download'}
        </button>
      </div>

      {status?.path && (
        <p className="text-xs text-text-muted font-mono truncate" title={status.path}>
          {status.path}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">
            Path override{' '}
            <span className="text-text-muted opacity-60">(leave blank to use auto-managed binary)</span>
          </label>
          {overrideDisabled && <EnvBadge />}
        </div>
        <input
          type="text"
          value={overridePath}
          disabled={overrideDisabled}
          onChange={(e) => onOverrideChange(e.target.value)}
          placeholder={`/usr/local/bin/${name === 'ytdlp' ? 'yt-dlp' : name}`}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
