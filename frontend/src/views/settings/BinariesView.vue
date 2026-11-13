<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useSettings } from './useSettings'
import SaveRow from './SaveRow.vue'
import ErrorTag from './ErrorTag.vue'
import { messageOf, useActionError } from '@/composables/useActionError'

interface BinaryStatus {
  name: string
  path: string
  exists: boolean
  version: string | null
}

const { settings, save, isOverridden, saved, error } = useSettings()
const binaries = ref<Record<string, BinaryStatus>>({})
/** Binaries with a download in flight, so each panel's button tracks its own download. */
const busy = ref(new Set<string>())
/** Per-binary feedback from the last "Download / update" click, keyed by binary name. */
const downloadNotes = ref<Record<string, string>>({})

async function loadBins() {
  binaries.value = await api('/api/binaries')
}

// The binaries list's own load tag; the paths form above reports its load in its save row.
const { error: binsError, load: initialLoadBins } = useActionError(loadBins)

async function download(name: string) {
  busy.value.add(name)
  downloadNotes.value[name] = ''
  try {
    const res = await api<BinaryStatus>(`/api/binaries/${encodeURIComponent(name)}`, { method: 'POST' })
    if (!res.exists) downloadNotes.value[name] = 'Downloaded, but the binary cannot run on this system'
  } catch (e) {
    downloadNotes.value[name] = `Download failed: ${messageOf(e)}`
  }
  try {
    await loadBins()
  } catch (e) {
    // Keep the download's own note if there is one; otherwise say the refresh failed.
    downloadNotes.value[name] ||= `Reload failed: ${messageOf(e)}`
  } finally {
    busy.value.delete(name)
  }
}

onMounted(initialLoadBins)
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
      <ErrorTag :message="binsError" class="self-start" />
      <div v-for="(b, key) in binaries" :key="key" class="panel" :class="{ 'panel-missing': !b.exists }">
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <h3>{{ b.name }}</h3>
          <p class="mono-sm text-text-muted truncate" :title="b.path">{{ b.path }}</p>
          <p class="min-w-0">
            <span class="pill label" :class="b.exists ? 'pill-ok' : 'pill-off'" :title="b.version || undefined">{{ b.exists ? (b.version || 'installed') : 'missing' }}</span>
          </p>
          <ErrorTag :message="downloadNotes[b.name] ?? ''" class="self-start" />
        </div>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="busy.has(b.name)"
          @click="download(b.name)"
        >{{ busy.has(b.name) ? '…' : 'Download / update' }}</button>
      </div>
    </div>
  </div>
</template>
