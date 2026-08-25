<script setup lang="ts">
import { onMounted, ref } from 'vue'

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

async function upload(tool: string, e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.[0]) return
  const fd = new FormData()
  fd.append('file', input.files[0])
  await fetch(`/api/cookies/${tool}`, { method: 'POST', body: fd })
  await load()
}

async function remove(tool: string) {
  await fetch(`/api/cookies/${tool}`, { method: 'DELETE' })
  await load()
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-4 max-w-xl">
    <div v-for="tool in (['ytdlp', 'gallerydl'] as const)" :key="tool" class="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-2">
      <h3 class="font-medium text-sm">{{ tool }} cookies</h3>
      <p class="text-xs text-text-muted">
        <template v-if="(tool === 'ytdlp' ? ytdlp : gallerydl)?.exists">
          {{ (tool === 'ytdlp' ? ytdlp : gallerydl)?.size }} bytes ·
          {{ (tool === 'ytdlp' ? ytdlp : gallerydl)?.modifiedAt }}
        </template>
        <template v-else>Not uploaded</template>
      </p>
      <div class="flex gap-2 items-center">
        <input type="file" accept=".txt" @change="upload(tool, $event)" />
        <button class="text-xs text-rose-400" @click="remove(tool)">Delete</button>
      </div>
    </div>
  </div>
</template>
