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
  <div v-if="open" class="modal">
    <div class="modal-backdrop" @click="open = false" />
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="Add to vault">
      <div class="modal-head">
        <h2>Add to vault</h2>
        <button type="button" class="btn btn-sm btn-icon" aria-label="Close" @click="open = false">✕</button>
      </div>
      <label class="check">
        <input type="checkbox" v-model="includeInRandom" />
        Include in random
      </label>
      <form class="stack" @submit.prevent="submitUrl">
        <input
          v-model="url"
          type="url"
          required
          placeholder="https://..."
          aria-label="URL"
          class="input"
        />
        <div class="radios">
          <label class="check">
            <input v-model="downloader" type="radio" value="ytdlp" /> yt-dlp (video)
          </label>
          <label class="check">
            <input v-model="downloader" type="radio" value="gallery-dl" /> gallery-dl
          </label>
        </div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="busy">Queue download</button>
      </form>

      <div class="divider"><span class="label">Or upload files</span></div>

      <div
        class="dropzone"
        :class="{ over: dragOver }"
        role="button"
        tabindex="0"
        aria-label="Drop files here or browse"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @click="fileInput?.click()"
        @keydown.enter.prevent="fileInput?.click()"
        @keydown.space.prevent="fileInput?.click()"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 18V5M5 11l7-7 7 7M3 21h18"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="square"
          />
        </svg>
        <p class="drop-title">Drop files here or <u>browse</u></p>
        <p class="label drop-hint">Videos and images</p>
      </div>

      <input
        ref="fileInput"
        type="file"
        multiple
        accept="video/*,image/*"
        class="hidden"
        @change="onBrowse"
      />

      <ul v-if="selectedFiles.length" class="file-list">
        <li
          v-for="{ file, state, error: fileError } in selectedFiles"
          :key="file.name"
          class="file"
          :class="`file-${state}`"
        >
          <span class="file-icon" :aria-label="state">{{
            state === 'done' ? '✓' : state === 'error' ? '✕' : ''
          }}</span>
          <span class="file-name truncate">{{ file.name }}</span>
          <span v-if="state === 'error' && fileError" class="file-msg truncate">{{ fileError }}</span>
          <button
            v-if="state === 'pending' && !busy"
            type="button"
            class="file-remove"
            :aria-label="`Remove ${file.name}`"
            @click="removeFile(file.name)"
          >✕</button>
        </li>
      </ul>

      <button
        v-if="!allDone"
        type="button"
        class="btn btn-primary btn-block"
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
      <button v-else type="button" class="btn btn-block" @click="open = false">Done</button>

      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.radios { display: flex; flex-wrap: wrap; gap: 10px 24px; }

.divider { display: flex; align-items: center; gap: 10px; color: var(--text-muted); }
.divider::before, .divider::after { content: ""; flex: 1; border-top: var(--bw) solid var(--border); }

.dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 16px; text-align: center; cursor: pointer;
  border: var(--bw) dashed var(--border); color: var(--text-secondary);
  transition: background-color 80ms, transform 80ms;
}
.dropzone:hover { background: var(--surface-2); }
.dropzone:focus-visible { outline: var(--bw) dashed var(--accent); outline-offset: 3px; }
.dropzone.over {
  background: var(--pop-1); color: var(--on-pop); border-style: solid;
  transform: rotate(-1deg) scale(1.02); box-shadow: 6px 6px 0 var(--shadow);
}
.drop-title { font-weight: 800; }
.drop-hint { color: var(--text-muted); }
.dropzone.over .drop-hint { color: inherit; }

.file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 12rem; overflow-y: auto; }
.file { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: var(--bw-thin) solid var(--border); font-size: 0.85rem; min-width: 0; }
.file-icon {
  flex: none; width: 20px; height: 20px; display: grid; place-items: center;
  border: var(--bw-thin) solid var(--border); font-weight: 900; font-size: 0.75rem;
}
.file-done .file-icon { background: var(--ok); color: var(--on-ok); }
.file-error .file-icon { background: var(--danger); color: var(--on-danger); }
.file-error .file-name { color: var(--danger); }
.file-name { flex: 1; min-width: 0; }
.file-msg { flex: 0 1 auto; max-width: 45%; font-size: 0.75rem; font-weight: 700; color: var(--danger); }
.file-remove { flex: none; border: 0; background: none; cursor: pointer; font-weight: 900; color: var(--text-muted); padding: 2px 4px; }
.file-remove:hover { color: var(--danger); }

.error-text { font-weight: 700; color: var(--danger); }
</style>
