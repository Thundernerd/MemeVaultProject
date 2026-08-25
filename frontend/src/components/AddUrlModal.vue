<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ done: [] }>()

const url = ref('')
const downloader = ref<'ytdlp' | 'gallery-dl'>('ytdlp')
const error = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function submitUrl() {
  error.value = ''
  busy.value = true
  try {
    await api('/api/downloads', {
      method: 'POST',
      body: JSON.stringify({ url: url.value, downloader: downloader.value }),
    })
    url.value = ''
    open.value = false
    emit('done')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    busy.value = false
  }
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const fd = new FormData()
  for (const f of Array.from(input.files)) fd.append('files', f)
  busy.value = true
  error.value = ''
  try {
    await fetch('/api/media/upload', { method: 'POST', body: fd })
    open.value = false
    emit('done')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Upload failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/70" @click="open = false" />
    <div class="relative bg-surface-1 border border-border rounded-2xl w-full max-w-md p-5 flex flex-col gap-4">
      <h2 class="text-lg font-semibold">Add to vault</h2>
      <form class="flex flex-col gap-3" @submit.prevent="submitUrl">
        <input
          v-model="url"
          type="url"
          required
          placeholder="https://..."
          class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm"
        />
        <div class="flex gap-2">
          <label class="flex-1 text-sm">
            <input v-model="downloader" type="radio" value="ytdlp" /> yt-dlp (video)
          </label>
          <label class="flex-1 text-sm">
            <input v-model="downloader" type="radio" value="gallery-dl" /> gallery-dl
          </label>
        </div>
        <button
          type="submit"
          class="bg-accent hover:bg-accent-hover text-white rounded-lg py-2 text-sm font-medium"
          :disabled="busy"
        >Queue download</button>
      </form>
      <div class="border-t border-border pt-3">
        <p class="text-xs text-text-muted mb-2">Or upload files</p>
        <input ref="fileInput" type="file" multiple accept="video/*,image/*" @change="onFiles" />
      </div>
      <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
    </div>
  </div>
</template>
