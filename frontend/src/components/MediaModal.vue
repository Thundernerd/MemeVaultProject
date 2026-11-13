<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type MediaItem, type ShareLink, type Tag } from '@/api'

const props = defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ close: []; deleted: []; updated: [MediaItem] }>()

const tagInput = ref('')
const tags = ref<Tag[]>([...(props.item.tags || [])])
const shares = ref<ShareLink[]>([])
const includeRandom = ref(props.item.include_in_random === 1)
const busy = ref(false)
const copiedToken = ref<string | null>(null)
let copiedTimer: number | undefined

watch(
  () => props.item,
  (v) => {
    tags.value = [...(v.tags || [])]
    includeRandom.value = v.include_in_random === 1
  },
)

onMounted(async () => {
  shares.value = await api(`/api/media/${props.item.id}/share`)
})

onUnmounted(() => {
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
})

async function saveTags() {
  const names = tags.value.map((t) => t.name)
  tags.value = await api(`/api/media/${props.item.id}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags: names }),
  })
}

async function addTag() {
  const name = tagInput.value.trim()
  if (!name) return
  const tag = await api<Tag>(`/api/media/${props.item.id}/tags`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  if (!tags.value.find((t) => t.id === tag.id)) tags.value.push(tag)
  tagInput.value = ''
}

async function toggleRandom() {
  const updated = await api<MediaItem>(`/api/media/${props.item.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ includeInRandom: !includeRandom.value }),
  })
  includeRandom.value = updated.include_in_random === 1
  emit('updated', updated)
}

async function copyShareUrl(token: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(token))
    copiedToken.value = token
    if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copiedToken.value = null
    }, 1500)
  } catch { /* clipboard may be unavailable */ }
}

async function createShare() {
  const link = await api<ShareLink>(`/api/media/${props.item.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ allowDownload: true }),
  })
  shares.value.unshift(link)
  await copyShareUrl(link.token)
}

async function revokeShare(token: string) {
  await api(`/api/media/${props.item.id}/share/${token}`, { method: 'DELETE' })
  shares.value = shares.value.filter((s) => s.token !== token)
}

async function remove() {
  if (!confirm('Delete this media?')) return
  busy.value = true
  await api(`/api/media/${props.item.id}`, { method: 'DELETE' })
  emit('deleted')
  emit('close')
}

function shareUrl(token: string) {
  return `${location.origin}/share/${token}`
}
</script>

<template>
  <div class="modal" @keydown.esc="emit('close')">
    <div class="modal-backdrop" @click="emit('close')" />
    <div
      class="modal-box modal-wide"
      role="dialog"
      aria-modal="true"
      :aria-label="item.title || 'Untitled'"
    >
      <div class="player">
        <video
          v-if="item.type === 'video'"
          :src="`/api/media/${item.id}/file`"
          controls
          :poster="item.thumbnail_path ? `/api/media/${item.id}/thumbnail` : undefined"
        />
        <img v-else :src="`/api/media/${item.id}/file`" :alt="item.title || ''" />
      </div>
      <div class="modal-body">
        <div class="modal-head">
          <div class="min-w-0 flex-1">
            <h2 class="media-title">{{ item.title || 'Untitled' }}</h2>
            <p class="media-url truncate" :title="item.url">{{ item.url }}</p>
          </div>
          <button type="button" class="btn btn-sm btn-icon" aria-label="Close" @click="emit('close')">✕</button>
        </div>

        <section class="stack">
          <div v-if="tags.length" class="chips">
            <span v-for="t in tags" :key="t.id" class="chip chip-static">{{ t.name }}</span>
          </div>
          <form class="inline-form" @submit.prevent="addTag">
            <input v-model="tagInput" class="input input-sm" placeholder="Add tag" aria-label="Add tag" />
            <button type="submit" class="btn btn-sm btn-primary">Add</button>
            <button type="button" class="btn btn-sm" @click="saveTags">Save tags</button>
          </form>
        </section>

        <label class="check">
          <input type="checkbox" :checked="includeRandom" @change="toggleRandom" />
          Include in random
        </label>

        <section class="stack">
          <div class="flex items-center justify-between gap-3">
            <h3 class="label">Share links</h3>
            <button type="button" class="btn btn-sm btn-pop" @click="createShare">Create</button>
          </div>
          <div v-if="shares.length" class="stack">
            <div v-for="s in shares" :key="s.token" class="share">
              <a :href="shareUrl(s.token)" class="share-url truncate" target="_blank">{{ shareUrl(s.token) }}</a>
              <button type="button" class="btn btn-sm" @click="copyShareUrl(s.token)">{{
                copiedToken === s.token ? 'Copied' : 'Copy'
              }}</button>
              <button type="button" class="btn btn-sm btn-danger" @click="revokeShare(s.token)">Revoke</button>
            </div>
          </div>
        </section>

        <div class="modal-foot">
          <button type="button" class="btn btn-danger" :disabled="busy" @click="remove">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  background: #000; display: flex; align-items: center; justify-content: center;
  max-height: 50vh; border-bottom: var(--bw) solid var(--border); overflow: hidden;
}
.player img, .player video { display: block; max-width: 100%; max-height: 50vh; object-fit: contain; }
.player video { width: 100%; }

.media-title { font-size: clamp(1.2rem, 4vw, 1.7rem); text-transform: none; overflow-wrap: anywhere; }
.media-url { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-static { cursor: default; }
.chip-static:hover { box-shadow: none; }
.inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.share {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; min-width: 0;
  border: var(--bw-thin) solid var(--border); background: var(--surface-2);
}
.share-url {
  flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; color: var(--text-primary);
  text-decoration-color: var(--accent); text-decoration-thickness: 2px;
}
</style>
