<script setup lang="ts">
import { onMounted, ref } from 'vue'

type CookieTool = 'ytdlp' | 'gallerydl'
const tools: CookieTool[] = ['ytdlp', 'gallerydl']

interface CookieStatus {
  exists: boolean
  size: number | null
  modifiedAt: string | null
}

const ytdlp = ref<CookieStatus | null>(null)
const gallerydl = ref<CookieStatus | null>(null)

async function load() {
  ytdlp.value = await fetch('/api/cookies/ytdlp').then((r) => r.json())
  gallerydl.value = await fetch('/api/cookies/gallerydl').then((r) => r.json())
}

async function upload(tool: CookieTool, e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.[0]) return
  const fd = new FormData()
  fd.append('file', input.files[0])
  await fetch(`/api/cookies/${tool}`, { method: 'POST', body: fd })
  await load()
}

async function remove(tool: CookieTool) {
  await fetch(`/api/cookies/${tool}`, { method: 'DELETE' })
  await load()
}

function cookieStatus(tool: CookieTool) {
  return tool === 'ytdlp' ? ytdlp.value : gallerydl.value
}

onMounted(load)
</script>

<template>
  <div class="cards">
    <div
      v-for="tool in tools"
      :key="tool"
      class="panel stack"
      :class="{ 'panel-missing': !cookieStatus(tool)?.exists }"
    >
      <div class="flex items-center justify-between gap-3">
        <h3>{{ tool }} cookies</h3>
        <span class="pill label" :class="cookieStatus(tool)?.exists ? 'pill-ok' : 'pill-off'">
          {{ cookieStatus(tool)?.exists ? 'present' : 'missing' }}
        </span>
      </div>
      <p class="mono-sm text-text-muted">
        <template v-if="cookieStatus(tool)?.exists">
          {{ cookieStatus(tool)?.size }} bytes ·
          {{ cookieStatus(tool)?.modifiedAt }}
        </template>
        <template v-else>Not uploaded</template>
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <label class="btn btn-sm file-btn">
          Upload cookies.txt
          <input type="file" accept=".txt" class="sr-only" @change="upload(tool, $event)" />
        </label>
        <button type="button" class="btn btn-sm btn-danger" @click="remove(tool)">Delete</button>
      </div>
    </div>
  </div>
</template>
