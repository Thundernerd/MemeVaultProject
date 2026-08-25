<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api, type Album, type MediaItem, type QueueItem, type TagWithCount } from '@/api'
import MediaCard from '@/components/MediaCard.vue'
import AlbumCard from '@/components/AlbumCard.vue'
import MediaModal from '@/components/MediaModal.vue'
import AddUrlModal from '@/components/AddUrlModal.vue'
import DownloadProgress from '@/components/DownloadProgress.vue'

const media = ref<MediaItem[]>([])
const albums = ref<Album[]>([])
const tags = ref<TagWithCount[]>([])
const loading = ref(true)
const error = ref('')
const filter = ref<'all' | 'video' | 'image'>('all')
const search = ref('')
const selectedTags = ref<string[]>([])
const tagMode = ref<'any' | 'all'>('any')
const addOpen = ref(false)
const selected = ref<MediaItem | null>(null)
const activeQueue = ref<QueueItem[]>([])
let timer: number | undefined

async function load() {
  try {
    const [m, a, t] = await Promise.all([
      api<MediaItem[]>('/api/media'),
      api<Album[]>('/api/albums'),
      api<TagWithCount[]>('/api/tags'),
    ])
    media.value = m
    albums.value = a
    tags.value = t
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

async function pollQueue() {
  try {
    const items = await api<QueueItem[]>('/api/queue')
    const active = items.filter(
      (i) =>
        i.source !== 'discord' &&
        (i.status === 'pending' || i.status === 'downloading'),
    )
    if (activeQueue.value.length > active.length) await load()
    activeQueue.value = active
  } catch { /* ignore */ }
}

onMounted(() => {
  load()
  pollQueue()
  timer = window.setInterval(pollQueue, 100)
})
onUnmounted(() => clearInterval(timer))

type Entry =
  | { kind: 'media'; item: MediaItem; created_at: string }
  | { kind: 'album'; album: Album; created_at: string }

const entries = computed(() => {
  let list: Entry[] = [
    ...media.value.map((item) => ({ kind: 'media' as const, item, created_at: item.created_at })),
    ...albums.value.map((album) => ({ kind: 'album' as const, album, created_at: album.created_at })),
  ]
  list.sort((a, b) => b.created_at.localeCompare(a.created_at))

  if (filter.value !== 'all') {
    list = list.filter((e) => {
      if (e.kind === 'album') return filter.value === 'image'
      return e.item.type === filter.value
    })
  }
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter((e) => {
      if (e.kind === 'album') {
        return (e.album.title || '').toLowerCase().includes(q) || e.album.url.toLowerCase().includes(q)
      }
      return (
        (e.item.title || '').toLowerCase().includes(q) ||
        e.item.url.toLowerCase().includes(q) ||
        (e.item.tags || []).some((t) => t.name.toLowerCase().includes(q))
      )
    })
  }
  if (selectedTags.value.length) {
    list = list.filter((e) => {
      if (e.kind === 'album') {
        const names = e.album.media.flatMap((m) => (m.tags || []).map((t) => t.name))
        return tagMode.value === 'all'
          ? selectedTags.value.every((t) => names.includes(t))
          : selectedTags.value.some((t) => names.includes(t))
      }
      const names = (e.item.tags || []).map((t) => t.name)
      return tagMode.value === 'all'
        ? selectedTags.value.every((t) => names.includes(t))
        : selectedTags.value.some((t) => names.includes(t))
    })
  }
  return list
})

function toggleTag(name: string) {
  const i = selectedTags.value.indexOf(name)
  if (i >= 0) selectedTags.value.splice(i, 1)
  else selectedTags.value.push(name)
}
</script>

<template>
  <div class="flex flex-col gap-4 pb-12">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold">Vault</h1>
      <div class="ml-auto flex flex-wrap gap-2 items-center">
        <input
          v-model="search"
          placeholder="Search…"
          class="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm"
        />
        <select v-model="filter" class="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm">
          <option value="all">All</option>
          <option value="video">Video</option>
          <option value="image">Image</option>
        </select>
        <button
          class="bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-lg text-sm font-medium"
          @click="addOpen = true"
        >Add</button>
      </div>
    </div>

    <div v-if="tags.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="t in tags.slice(0, 40)"
        :key="t.id"
        class="text-xs px-2 py-1 rounded-full border transition-colors"
        :class="selectedTags.includes(t.name)
          ? 'border-accent bg-accent-subtle text-accent'
          : 'border-border text-text-secondary hover:border-border-strong'"
        @click="toggleTag(t.name)"
      >{{ t.name }}</button>
      <button
        class="text-xs px-2 py-1 text-text-muted"
        @click="tagMode = tagMode === 'any' ? 'all' : 'any'"
      >match: {{ tagMode }}</button>
    </div>

    <p v-if="error" class="text-rose-400 text-sm">{{ error }}</p>
    <p v-else-if="loading" class="text-text-muted text-sm">Loading…</p>

    <div v-if="activeQueue.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      <div
        v-for="q in activeQueue"
        :key="q.id"
        class="aspect-square rounded-xl border border-dashed border-border-strong bg-surface-2/50 flex flex-col items-center justify-center p-3 gap-2"
      >
        <p class="text-xs text-text-muted truncate w-full text-center" :title="q.url">{{ q.url }}</p>
        <DownloadProgress :status="q.status" :progress="q.progress" />
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      <template v-for="e in entries" :key="e.kind === 'media' ? e.item.id : e.album.id">
        <MediaCard v-if="e.kind === 'media'" :item="e.item" @click="selected = e.item" />
        <AlbumCard v-else :album="e.album" />
      </template>
    </div>

    <p v-if="!loading && !entries.length" class="text-text-muted text-sm text-center py-12">
      Vault is empty. Add a URL or upload a file.
    </p>

    <AddUrlModal v-model:open="addOpen" @done="load" />
    <MediaModal
      v-if="selected"
      :item="selected"
      @close="selected = null"
      @deleted="load(); selected = null"
      @updated="(u) => { selected = u; load() }"
    />
  </div>
</template>
