<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useSettings } from './useSettings'
import SaveRow from './SaveRow.vue'

interface BinaryStatus {
  name: string
  path: string
  exists: boolean
  version: string | null
}

const { settings, save, isOverridden, saved, error } = useSettings()
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
  <div class="stack-lg">
    <form class="settings-form" @submit.prevent="save(['ytdlp_bin', 'gallerydl_bin', 'ffmpeg_bin'])">
      <label class="field">
        <span class="label">yt-dlp path<span v-if="isOverridden('ytdlp_bin')" class="env-badge">env</span></span>
        <input v-model="settings.ytdlp_bin" class="input" placeholder="auto-managed" />
      </label>
      <label class="field">
        <span class="label">gallery-dl path</span>
        <input v-model="settings.gallerydl_bin" class="input" placeholder="auto-managed" />
      </label>
      <label class="field">
        <span class="label">ffmpeg path</span>
        <input v-model="settings.ffmpeg_bin" class="input" placeholder="auto-managed" />
      </label>
      <SaveRow :saved="saved" :error="error" label="Save paths" />
    </form>

    <div class="cards">
      <div v-for="(b, key) in binaries" :key="key" class="panel" :class="{ 'panel-missing': !b.exists }">
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <h3>{{ b.name }}</h3>
          <p class="mono-sm text-text-muted truncate" :title="b.path">{{ b.path }}</p>
          <p class="min-w-0">
            <span class="pill label" :class="b.exists ? 'pill-ok' : 'pill-off'" :title="b.version || undefined">{{ b.exists ? (b.version || 'installed') : 'missing' }}</span>
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="busy === b.name"
          @click="download(b.name)"
        >{{ busy === b.name ? '…' : 'Download / update' }}</button>
      </div>
    </div>
  </div>
</template>
