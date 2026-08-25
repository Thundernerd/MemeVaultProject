<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api, type MediaItem, type ShareLink, type Tag } from '@/api'

const props = defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ close: []; deleted: []; updated: [MediaItem] }>()

const tagInput = ref('')
const tags = ref<Tag[]>([...(props.item.tags || [])])
const shares = ref<ShareLink[]>([])
const includeRandom = ref(props.item.include_in_random === 1)
const busy = ref(false)

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

async function createShare() {
  const link = await api<ShareLink>(`/api/media/${props.item.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ allowDownload: true }),
  })
  shares.value.unshift(link)
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
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4" @keydown.esc="emit('close')">
    <div class="absolute inset-0 bg-black/70" @click="emit('close')" />
    <div class="relative bg-surface-1 border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
      <div class="bg-black flex items-center justify-center max-h-[50vh]">
        <video
          v-if="item.type === 'video'"
          :src="`/api/media/${item.id}/file`"
          controls
          class="max-h-[50vh] w-full"
          :poster="item.thumbnail_path ? `/api/media/${item.id}/thumbnail` : undefined"
        />
        <img
          v-else
          :src="`/api/media/${item.id}/file`"
          :alt="item.title || ''"
          class="max-h-[50vh] object-contain"
        />
      </div>
      <div class="p-5 flex flex-col gap-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">{{ item.title || 'Untitled' }}</h2>
            <p class="text-xs text-text-muted truncate">{{ item.url }}</p>
          </div>
          <button class="text-text-muted hover:text-text-primary" @click="emit('close')">✕</button>
        </div>

        <div class="flex flex-wrap gap-2 items-center">
          <span
            v-for="t in tags"
            :key="t.id"
            class="text-xs px-2 py-1 rounded-full bg-surface-2 text-text-secondary"
          >{{ t.name }}</span>
          <form class="flex gap-1" @submit.prevent="addTag">
            <input v-model="tagInput" class="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs" placeholder="Add tag" />
            <button class="text-xs px-2 py-1 rounded-lg bg-accent text-white">Add</button>
          </form>
          <button class="text-xs text-text-muted underline" @click="saveTags">Save tags</button>
        </div>

        <label class="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" :checked="includeRandom" @change="toggleRandom" />
          Include in random
        </label>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">Share links</h3>
            <button class="text-xs px-3 py-1 rounded-lg bg-surface-2 hover:bg-surface-3" @click="createShare">Create</button>
          </div>
          <div v-for="s in shares" :key="s.token" class="flex items-center gap-2 text-xs">
            <a :href="shareUrl(s.token)" class="text-accent truncate flex-1" target="_blank">{{ shareUrl(s.token) }}</a>
            <button class="text-text-muted hover:text-rose-400" @click="revokeShare(s.token)">Revoke</button>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-border">
          <button class="px-3 py-1.5 text-sm rounded-lg text-rose-400 hover:bg-surface-2" :disabled="busy" @click="remove">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
