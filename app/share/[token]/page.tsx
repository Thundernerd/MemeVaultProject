import { getShareLink, getMediaItem } from '@/lib/db';
import { notFound } from 'next/navigation';

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

  const fileSrc = `/api/share/${token}/file`;
  const thumbnailSrc = media.thumbnail_path ? `/api/share/${token}/thumbnail` : null;
  const displayTitle = media.title ?? 'Shared media';
  const allowDownload = link.allow_download === 1;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <header className="px-5 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-400 tracking-wide">MemeVault</span>
      </header>

      {/* Media */}
      <div className="bg-black flex items-center justify-center w-full" style={{ maxHeight: '70vh' }}>
        {media.type === 'video' ? (
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
      <div className="flex items-center justify-between gap-4 px-5 py-4 max-w-3xl mx-auto w-full">
        <h1 className="text-base font-medium text-white leading-snug truncate">{displayTitle}</h1>
        {allowDownload && (
          <a
            href={fileSrc}
            download
            className="shrink-0 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-1.5 rounded-lg transition-colors"
          >
            Download
          </a>
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
