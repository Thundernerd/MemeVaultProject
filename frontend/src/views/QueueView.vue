<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api, type QueueItem } from '@/api'
import AddUrlModal from '@/components/AddUrlModal.vue'
import DownloadProgress from '@/components/DownloadProgress.vue'

const items = ref<QueueItem[]>([])
const error = ref('')
const addOpen = ref(false)
let timer: number | undefined

async function load() {
  try {
    items.value = await api('/api/queue')
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed'
  }
}

async function cancel(id: string) {
  await api(`/api/queue/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'cancel' }) })
  await load()
}

async function remove(id: string) {
  await api(`/api/queue/${id}`, { method: 'DELETE' })
  await load()
}

async function retry(item: QueueItem) {
  await api('/api/downloads', {
    method: 'POST',
    body: JSON.stringify({ url: item.url, downloader: item.downloader }),
  })
  await load()
}

onMounted(() => {
  load()
  timer = window.setInterval(load, 100)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="flex flex-col gap-4 pb-12">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Queue</h1>
      <button
        class="ml-auto bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-lg text-sm"
        @click="addOpen = true"
      >Add URL</button>
    </div>
    <p v-if="error" class="text-rose-400 text-sm">{{ error }}</p>
    <div v-if="!items.length" class="text-text-muted text-sm py-8 text-center">Queue is empty</div>
    <div v-for="item in items" :key="item.id" class="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-2">
      <div class="flex gap-3 items-start">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <p class="text-sm truncate">{{ item.url }}</p>
            <span
              v-if="item.source_label"
              class="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-white"
              :style="{ backgroundColor: item.source === 'discord' ? '#5865F2' : '#0d9488' }"
            >{{ item.source_label }}</span>
          </div>
          <p class="text-xs text-text-muted">{{ item.downloader }} · {{ item.status }}</p>
        </div>
        <div class="flex gap-1 shrink-0">
          <button
            v-if="item.status === 'pending' || item.status === 'downloading'"
            class="text-xs px-2 py-1 rounded bg-surface-2"
            @click="cancel(item.id)"
          >Cancel</button>
          <button
            v-if="item.source !== 'discord' && (item.status === 'failed' || item.status === 'cancelled')"
            class="text-xs px-2 py-1 rounded bg-surface-2"
            @click="retry(item)"
          >Retry</button>
          <button class="text-xs px-2 py-1 rounded text-rose-400 hover:bg-surface-2" @click="remove(item.id)">Remove</button>
        </div>
      </div>
      <DownloadProgress :status="item.status" :progress="item.progress" />
      <p v-if="item.error" class="text-xs text-rose-400">{{ item.error }}</p>
    </div>
    <AddUrlModal v-model:open="addOpen" @done="load" />
  </div>
</template>
