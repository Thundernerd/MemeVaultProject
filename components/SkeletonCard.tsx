import type { QueueStatus } from '@/lib/db';

interface Props {
  status: QueueStatus;
  progress: number;
}

export default function SkeletonCard({ status, progress }: Props) {
  return (
    <div className="bg-surface-1 border border-border rounded-2xl overflow-hidden flex flex-col">
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video bg-surface-2 overflow-hidden">
        <div className="absolute inset-0 animate-pulse bg-surface-3/50" />

        {/* Status badge */}
        <span className="absolute top-2 left-2 bg-black/60 text-xs text-text-secondary px-2 py-0.5 rounded">
          {status === 'downloading' ? 'Downloading…' : 'Queued'}
        </span>

        {/* Progress bar */}
        {status === 'downloading' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-3">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Info placeholder */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="h-3.5 bg-surface-2 animate-pulse rounded w-4/5" />
        <div className="h-3 bg-surface-2 animate-pulse rounded w-2/5" />
      </div>

      {/* Actions placeholder */}
      <div className="px-3 pb-3 flex gap-2">
        <div className="flex-1 h-7 bg-surface-2 animate-pulse rounded-lg" />
        <div className="flex-1 h-7 bg-surface-2 animate-pulse rounded-lg" />
      </div>
    </div>
  );
}
