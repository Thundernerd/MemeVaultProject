import { getShareLink, getMediaItem, getSetting } from '@/lib/db';
import { mimeType } from '@/lib/utils';
import { notFound } from 'next/navigation';
import path from 'path';

export const dynamic = 'force-dynamic';

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

  // OG embed meta — React 19 hoists <meta> tags to <head> automatically
  const baseUrl = (getSetting('share_base_url') ?? '').replace(/\/$/, '');
  const absFileSrc = baseUrl ? `${baseUrl}${fileSrc}` : null;
  const absThumbnailSrc = baseUrl && thumbnailSrc ? `${baseUrl}${thumbnailSrc}` : null;
  const ext = path.extname(media.file_path).toLowerCase();
  const rawMime = mimeType(ext);
  const videoMime = rawMime === 'application/octet-stream' ? 'video/mp4' : rawMime;

  return (
    <>
      {absFileSrc && media.type === 'video' && (
        <>
          <meta property="og:type" content="video.other" />
          <meta property="og:title" content={displayTitle} />
          <meta property="og:video" content={absFileSrc} />
          <meta property="og:video:type" content={videoMime} />
          {media.width && <meta property="og:video:width" content={String(media.width)} />}
          {media.height && <meta property="og:video:height" content={String(media.height)} />}
          {absThumbnailSrc && <meta property="og:image" content={absThumbnailSrc} />}
          <meta name="twitter:card" content="player" />
          <meta name="twitter:title" content={displayTitle} />
          <meta name="twitter:player" content={`${baseUrl}/share/${token}`} />
          <meta name="twitter:player:stream" content={absFileSrc} />
          <meta name="twitter:player:stream:content_type" content={videoMime} />
          <meta name="twitter:player:width" content={String(media.width ?? 1280)} />
          <meta name="twitter:player:height" content={String(media.height ?? 720)} />
          {absThumbnailSrc && <meta name="twitter:image" content={absThumbnailSrc} />}
        </>
      )}
      {absFileSrc && media.type === 'image' && (
        <>
          <meta property="og:type" content="website" />
          <meta property="og:title" content={displayTitle} />
          <meta property="og:image" content={absThumbnailSrc ?? absFileSrc} />
          {media.width && <meta property="og:image:width" content={String(media.width)} />}
          {media.height && <meta property="og:image:height" content={String(media.height)} />}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={displayTitle} />
          <meta name="twitter:image" content={absThumbnailSrc ?? absFileSrc} />
        </>
      )}

      <div className="min-h-screen bg-surface-base flex flex-col">
        <header className="h-16 bg-surface-1/70 backdrop-blur-md border-b border-border flex items-center px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/safe.png" alt="MVP" className="w-8 h-8 shrink-0 invert mix-blend-screen" />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-base font-bold text-text-primary tracking-tight">MVP</span>
            </div>
          </div>
        </header>

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

        <div className="flex items-center justify-between gap-4 px-5 py-4 max-w-3xl mx-auto w-full">
          <h1 className="text-base font-medium text-text-primary leading-snug truncate">{displayTitle}</h1>
          {allowDownload && (
            <a
              href={fileSrc}
              download
              className="shrink-0 text-sm bg-surface-2 hover:bg-surface-3 text-text-primary px-4 py-1.5 rounded-lg transition-colors"
            >
              Download
            </a>
          )}
        </div>

        <footer className="mt-auto px-5 py-4 border-t border-border text-center">
          <span className="text-xs text-text-muted">Shared via MemeVault</span>
        </footer>
      </div>
    </>
  );
}
