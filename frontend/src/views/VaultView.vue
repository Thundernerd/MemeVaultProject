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
const filtersOpen = ref(false)
let timer: number | undefined

const activeFilterCount = computed(() => {
  let n = selectedTags.value.length
  if (filter.value !== 'all') n += 1
  return n
})

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
        !['discord', 'fluxer'].includes(i.source) &&
        (i.status === 'pending' || i.status === 'downloading'),
    )
    if (activeQueue.value.length > active.length) await load()
    activeQueue.value = active
  } catch { /* ignore */ }
}

onMounted(() => {
  filtersOpen.value = window.matchMedia('(min-width: 768px)').matches
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
  <div class="flex flex-col gap-5 pb-12">
    <div class="flex flex-wrap items-end gap-x-4 gap-y-3">
      <h1>Vault</h1>
      <div class="flex flex-wrap items-center gap-2.5 w-full md:w-auto md:ml-auto">
        <input
          v-model="search"
          type="search"
          placeholder="Search…"
          aria-label="Search"
          class="input basis-full md:basis-auto md:w-[220px]"
        />
        <button
          type="button"
          class="btn"
          :class="{ 'btn-on': filtersOpen }"
          :aria-expanded="filtersOpen"
          aria-controls="vault-filters"
          @click="filtersOpen = !filtersOpen"
        >
          <span
            class="inline-block text-[0.6rem] transition-transform duration-[120ms]"
            :class="{ 'rotate-180': filtersOpen }"
            aria-hidden="true"
          >▼</span>
          {{ filtersOpen ? 'Hide filters' : 'Show filters' }}
          <span v-if="!filtersOpen && activeFilterCount" class="count">{{ activeFilterCount }}</span>
        </button>
        <button type="button" class="btn btn-primary" @click="addOpen = true">Add</button>
      </div>
    </div>

    <div v-show="filtersOpen" id="vault-filters" class="filters">
      <div class="flex items-center gap-2.5">
        <label for="vault-type" class="label">Type</label>
        <select id="vault-type" v-model="filter" class="select w-auto min-w-[140px]">
          <option value="all">All</option>
          <option value="video">Video</option>
          <option value="image">Image</option>
        </select>
      </div>
      <div v-if="tags.length" class="flex flex-wrap gap-2">
        <button
          v-for="t in tags.slice(0, 40)"
          :key="t.id"
          type="button"
          class="chip"
          :class="{ on: selectedTags.includes(t.name) }"
          :aria-pressed="selectedTags.includes(t.name)"
          @click="toggleTag(t.name)"
        >{{ t.name }}</button>
        <button
          type="button"
          class="chip chip-mode"
          @click="tagMode = tagMode === 'any' ? 'all' : 'any'"
        >match: {{ tagMode }}</button>
      </div>
    </div>

    <div v-if="error" class="state state-error" role="alert">
      <span class="state-tag label">error</span>
      <p class="state-text">{{ error }}</p>
    </div>
    <div v-else-if="loading" class="state state-loading" role="status">
      <span class="state-tag label">loading</span>
      <p class="state-text">Loading…</p>
    </div>

    <template v-if="activeQueue.length">
      <h2 class="label text-text-muted">Downloading · {{ activeQueue.length }}</h2>
      <div class="vault-grid">
        <div v-for="q in activeQueue" :key="q.id" class="pending-card">
          <p class="pending-url truncate" :title="q.url">{{ q.url }}</p>
          <DownloadProgress :status="q.status" :progress="q.progress" />
        </div>
      </div>
    </template>

    <div v-if="entries.length" class="vault-grid">
      <template v-for="e in entries" :key="e.kind === 'media' ? e.item.id : e.album.id">
        <MediaCard v-if="e.kind === 'media'" :item="e.item" @click="selected = e.item" />
        <AlbumCard v-else :album="e.album" />
      </template>
    </div>

    <div v-if="!loading && !error && !entries.length" class="state state-empty" role="status">
      <span class="state-tag label">empty</span>
      <p class="state-text">Vault is empty. Add a URL or upload a file.</p>
    </div>

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
