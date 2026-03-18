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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          {status === null ? (
            <span className="text-xs text-zinc-600">Checking…</span>
          ) : status.exists ? (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Configured</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-700/60 text-zinc-400">Not set</span>
          )}
          {status?.exists && status.size !== null && (
            <span className="text-xs text-zinc-500">{(status.size / 1024).toFixed(1)} KB</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              uploading
                ? 'bg-blue-600/40 text-white opacity-50 cursor-not-allowed'
                : 'bg-blue-600/80 hover:bg-blue-600 text-white'
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
        <p className="text-xs text-zinc-600">
          Last updated {new Date(status.modifiedAt).toLocaleString()}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}
