<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ done: [] }>()

interface FileStatus {
  file: File
  state: 'pending' | 'done' | 'error'
  error?: string
}

interface UploadResult {
  success: boolean
  filename: string
  error?: string
}

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'wmv', '3gp'])
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'tiff', 'bmp'])

const url = ref('')
const downloader = ref<'ytdlp' | 'gallery-dl'>('ytdlp')
const error = ref('')
const busy = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<FileStatus[]>([])
const includeInRandom = ref(false)

const pendingCount = computed(() => selectedFiles.value.filter((f) => f.state === 'pending').length)
const allDone = computed(
  () => selectedFiles.value.length > 0 && selectedFiles.value.every((f) => f.state === 'done'),
)

watch(open, (isOpen) => {
  if (!isOpen) {
    selectedFiles.value = []
    dragOver.value = false
    error.value = ''
  }
})

function isAllowedFile(file: File): boolean {
  if (file.type.startsWith('video/') || file.type.startsWith('image/')) return true
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : ''
  return VIDEO_EXTS.has(ext) || IMAGE_EXTS.has(ext)
}

function addFiles(incoming: FileList | File[]) {
  const list = Array.from(incoming)
  const existingNames = new Set(selectedFiles.value.map((f) => f.file.name))
  const next: FileStatus[] = []

  for (const file of list) {
    if (existingNames.has(file.name)) continue
    existingNames.add(file.name)
    if (!isAllowedFile(file)) {
      next.push({ file, state: 'error', error: 'unsupported file type' })
      continue
    }
    next.push({ file, state: 'pending' })
  }

  if (next.length) selectedFiles.value = [...selectedFiles.value, ...next]
}

function removeFile(name: string) {
  selectedFiles.value = selectedFiles.value.filter((f) => f.file.name !== name)
}

function onBrowse(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

async function submitUrl() {
  error.value = ''
  busy.value = true
  try {
    await api('/api/downloads', {
      method: 'POST',
      body: JSON.stringify({
        url: url.value,
        downloader: downloader.value,
        includeInRandom: includeInRandom.value,
      }),
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

async function handleUpload() {
  const pending = selectedFiles.value.filter((f) => f.state === 'pending')
  if (!pending.length || busy.value) return

  busy.value = true
  error.value = ''

  const fd = new FormData()
  for (const { file } of pending) fd.append('files', file)

  try {
    const qs = includeInRandom.value ? '?includeInRandom=true' : ''
    const res = await fetch(`/api/media/upload${qs}`, { method: 'POST', body: fd })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `Upload failed (${res.status})`)
    }

    const json = (await res.json()) as { results: UploadResult[] }
    selectedFiles.value = selectedFiles.value.map((entry) => {
      if (entry.state !== 'pending') return entry
      const result = json.results.find((r) => r.filename === entry.file.name)
      if (!result) return { ...entry, state: 'error', error: 'No result from server' }
      return result.success
        ? { ...entry, state: 'done' }
        : { ...entry, state: 'error', error: result.error || 'Upload failed' }
    })

    if (json.results.some((r) => r.success)) emit('done')
    if (selectedFiles.value.every((f) => f.state === 'done')) open.value = false
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    selectedFiles.value = selectedFiles.value.map((entry) =>
      entry.state === 'pending' ? { ...entry, state: 'error', error: message } : entry,
    )
    error.value = message
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
      <label class="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" v-model="includeInRandom" />
        Include in random
      </label>
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
          class="bg-accent hover:bg-accent-hover text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          :disabled="busy"
        >Queue download</button>
      </form>

      <div class="border-t border-border pt-3 flex flex-col gap-3">
        <p class="text-xs text-text-muted">Or upload files</p>

        <div
          class="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-colors"
          :class="dragOver
            ? 'border-accent bg-accent-subtle'
            : 'border-border hover:border-border-strong'"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="fileInput?.click()"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-secondary"
          >
            <path d="M12 18V6M6 12l6-6 6 6" />
            <path d="M3 20h18" />
          </svg>
          <p class="text-sm text-text-secondary">
            Drop files here or <span class="text-text-primary">browse</span>
          </p>
          <p class="text-xs text-text-muted">Videos and images</p>
        </div>

        <input
          ref="fileInput"
          type="file"
          multiple
          accept="video/*,image/*"
          class="hidden"
          @change="onBrowse"
        />

        <ul v-if="selectedFiles.length" class="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
          <li
            v-for="{ file, state, error: fileError } in selectedFiles"
            :key="file.name"
            class="flex items-center gap-2 text-sm"
          >
            <span
              v-if="state === 'pending'"
              class="w-4 h-4 rounded-full border border-border-strong shrink-0"
            />
            <svg
              v-else-if="state === 'done'"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="text-green-400 shrink-0"
            >
              <path d="M3 8l3.5 3.5L13 5" />
            </svg>
            <svg
              v-else
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="text-rose-400 shrink-0"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            <span
              class="flex-1 truncate"
              :class="state === 'error' ? 'text-rose-400' : 'text-text-secondary'"
            >{{ file.name }}</span>
            <span
              v-if="state === 'error' && fileError"
              class="text-xs text-rose-500 shrink-0 max-w-32 truncate"
            >{{ fileError }}</span>
            <button
              v-if="state === 'pending' && !busy"
              type="button"
              class="text-text-muted hover:text-text-secondary shrink-0 transition-colors"
              aria-label="Remove"
              @click="removeFile(file.name)"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </li>
        </ul>

        <button
          v-if="!allDone"
          type="button"
          class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          :disabled="pendingCount === 0 || busy"
          @click="handleUpload"
        >
          {{
            busy
              ? 'Uploading…'
              : pendingCount > 0
                ? `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`
                : 'Upload'
          }}
        </button>
        <button
          v-else
          type="button"
          class="w-full bg-surface-2 hover:bg-surface-3 text-text-primary text-sm font-medium py-2.5 rounded-lg transition-colors"
          @click="open = false"
        >
          Done
        </button>
      </div>

      <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
    </div>
  </div>
</template>
