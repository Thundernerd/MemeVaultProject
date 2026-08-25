<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useSettings } from './useSettings'

interface BinaryStatus {
  name: string
  path: string
  exists: boolean
  version: string | null
}

const { settings, save, isOverridden } = useSettings()
const binaries = ref<Record<string, BinaryStatus>>({})
const busy = ref('')

async function loadBins() {
  binaries.value = await api('/api/binaries')
}

async function download(name: string) {
  busy.value = name
  try {
    await api(`/api/binaries/${encodeURIComponent(name)}`, { method: 'POST' })
    await loadBins()
  } finally {
    busy.value = ''
  }
}

onMounted(loadBins)
</script>

<template>
  <div class="flex flex-col gap-6 max-w-xl">
    <form class="flex flex-col gap-3" @submit.prevent="save(['ytdlp_bin', 'gallerydl_bin', 'ffmpeg_bin'])">
      <label class="flex flex-col gap-1 text-sm">
        <span>yt-dlp path {{ isOverridden('ytdlp_bin') ? '(env)' : '' }}</span>
        <input v-model="settings.ytdlp_bin" class="bg-surface-2 border border-border rounded-lg px-3 py-2" placeholder="auto-managed" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span>gallery-dl path</span>
        <input v-model="settings.gallerydl_bin" class="bg-surface-2 border border-border rounded-lg px-3 py-2" placeholder="auto-managed" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span>ffmpeg path</span>
        <input v-model="settings.ffmpeg_bin" class="bg-surface-2 border border-border rounded-lg px-3 py-2" placeholder="auto-managed" />
      </label>
      <button type="submit" class="self-start bg-accent text-white px-4 py-2 rounded-lg text-sm">Save paths</button>
    </form>

    <div v-for="(b, key) in binaries" :key="key" class="bg-surface-1 border border-border rounded-xl p-4 flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <p class="font-medium text-sm">{{ b.name }}</p>
        <p class="text-xs text-text-muted truncate">{{ b.path }}</p>
        <p class="text-xs" :class="b.exists ? 'text-green-400' : 'text-rose-400'">
          {{ b.exists ? (b.version || 'installed') : 'missing' }}
        </p>
      </div>
      <button
        class="text-sm px-3 py-1.5 rounded-lg bg-surface-2"
        :disabled="busy === b.name"
        @click="download(b.name)"
      >{{ busy === b.name ? '…' : 'Download / update' }}</button>
    </div>
  </div>
</template>
