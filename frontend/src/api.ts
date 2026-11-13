export interface Tag {
  id: string
  name: string
  created_at: string
}

export interface TagWithCount extends Tag {
  usage_count: number
}

export interface MediaItem {
  id: string
  queue_item_id: string | null
  url: string
  type: string
  title: string | null
  description: string | null
  uploader: string | null
  duration: number | null
  thumbnail_path: string | null
  file_path: string
  file_size: number | null
  format: string | null
  width: number | null
  height: number | null
  created_at: string
  raw_metadata: string | null
  album_id: string | null
  include_in_random: number
  tags?: Tag[]
}

export interface Album {
  id: string
  queue_item_id: string | null
  url: string
  title: string | null
  uploader: string | null
  created_at: string
  media: MediaItem[]
}

/** Queue item lifecycle, as written by the backend (`src/queue.rs`). */
export type QueueStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled'

/** Where a queue item was submitted from. */
export type QueueSource = 'web' | 'api' | 'discord' | 'fluxer'

/** Still in the queue: waiting or downloading, so it can be cancelled. */
export function isActive(status: QueueStatus): boolean {
  return status === 'pending' || status === 'downloading'
}

/** Submitted from a chat bot (Discord/Fluxer): the bot owns retries and replies, so it gets no Retry button and no Vault pending card. */
export function isChatSource(source: QueueSource): source is 'discord' | 'fluxer' {
  return source === 'discord' || source === 'fluxer'
}

export interface QueueItem {
  id: string
  url: string
  downloader: string
  status: QueueStatus
  progress: number
  error: string | null
  created_at: string
  completed_at: string | null
  source: QueueSource
  source_label: string | null
  include_in_random: number
}

export interface ShareLink {
  token: string
  media_id?: string
  album_id?: string
  allow_download: number
  expires_at: string | null
  created_at: string
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = await res.json()
      msg = j.error || msg
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return undefined as T
}
