import { CookieStatus } from './types';

export function CookieCard({
  label,
  tool,
  status,
  uploading,
  error,
  onUpload,
  onDelete,
}: {
  label: string;
  tool: string;
  status: CookieStatus | null;
  uploading: boolean;
  error: string;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {status === null ? (
            <span className="text-xs text-text-muted">Checking…</span>
          ) : status.exists ? (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Configured</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-text-secondary">Not set</span>
          )}
          {status?.exists && status.size !== null && (
            <span className="text-xs text-text-muted">{(status.size / 1024).toFixed(1)} KB</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              uploading
                ? 'bg-accent/40 text-white opacity-50 cursor-not-allowed'
                : 'bg-accent/80 hover:bg-accent text-white'
            }`}
          >
            {uploading ? 'Uploading…' : status?.exists ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </label>
          {status?.exists && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs px-3 py-1.5 bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded-lg transition-colors shrink-0"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {status?.exists && status.modifiedAt && (
        <p className="text-xs text-text-muted">
          Last updated {new Date(status.modifiedAt).toLocaleString()}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}
