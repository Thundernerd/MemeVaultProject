import { getShareLink, getMediaItem } from '@/lib/db';
import { notFound } from 'next/navigation';

interface ShareMediaData {
  id: string;
  type: 'video' | 'image';
  title: string | null;
  description: string | null;
  url: string;
  uploader: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  file_size: number | null;
  has_thumbnail: boolean;
  allow_download: boolean;
  expires_at: string | null;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const link = getShareLink(token);
  if (!link) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const media = getMediaItem(link.media_id);
  if (!media) notFound();

  const item: ShareMediaData = {
    id: media.id,
    type: media.type,
    title: media.title,
    description: media.description,
    url: media.url,
    uploader: media.uploader,
    duration: media.duration,
    width: media.width,
    height: media.height,
    format: media.format,
    file_size: media.file_size,
    has_thumbnail: !!media.thumbnail_path,
    allow_download: link.allow_download === 1,
    expires_at: link.expires_at,
  };

  const fileSrc = `/api/share/${token}/file`;
  const thumbnailSrc = item.has_thumbnail ? `/api/share/${token}/thumbnail` : null;
  const displayTitle = item.title ?? 'Shared media';

  const metaRows: { label: string; value: string }[] = [
    item.uploader ? { label: 'Uploader', value: item.uploader } : null,
    item.duration ? { label: 'Duration', value: formatDuration(item.duration) } : null,
    item.width && item.height ? { label: 'Resolution', value: `${item.width}×${item.height}` } : null,
    item.format ? { label: 'Format', value: item.format.toUpperCase() } : null,
    item.file_size ? { label: 'File size', value: formatBytes(item.file_size) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-400 tracking-wide">MemeVault</span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View source ↗
          </a>
        )}
      </header>

      {/* Media */}
      <div className="bg-black flex items-center justify-center w-full" style={{ maxHeight: '70vh' }}>
        {item.type === 'video' ? (
          <video
            src={fileSrc}
            controls
            autoPlay
            poster={thumbnailSrc ?? undefined}
            className="w-full object-contain"
            style={{ maxHeight: '70vh' }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailSrc ?? fileSrc}
            alt={displayTitle}
            className="object-contain w-full"
            style={{ maxHeight: '70vh' }}
          />
        )}
      </div>

      {/* Info panel */}
      <div className="flex flex-col gap-4 px-5 py-6 max-w-3xl mx-auto w-full">
        <h1 className="text-lg font-semibold text-white leading-snug">{displayTitle}</h1>

        {item.description && (
          <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
            {item.description}
          </p>
        )}

        {metaRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {metaRows.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-zinc-200">{value}</span>
              </div>
            ))}
          </div>
        )}

        {item.allow_download && (
          <a
            href={fileSrc}
            download
            className="self-start text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-5 py-2 rounded-lg transition-colors"
          >
            Download
          </a>
        )}

        {item.expires_at && (
          <p className="text-xs text-zinc-600">
            This link expires{' '}
            {new Date(item.expires_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        )}
      </div>

      {/* Footer branding */}
      <footer className="mt-auto px-5 py-4 border-t border-zinc-900 text-center">
        <span className="text-xs text-zinc-700">Shared via MemeVault</span>
      </footer>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = getShareLink(token);
  if (!link || (link.expires_at && new Date(link.expires_at) < new Date())) {
    return { title: 'Not found' };
  }
  const media = getMediaItem(link.media_id);
  return { title: media?.title ?? 'Shared media' };
}
