<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api, isActive, isChatSource, type QueueItem, type QueueSource } from '@/api'
import AddUrlModal from '@/components/AddUrlModal.vue'
import DownloadProgress from '@/components/DownloadProgress.vue'

const items = ref<QueueItem[]>([])
const error = ref('')
const loaded = ref(false)
const addOpen = ref(false)
let timer: number | undefined

async function load() {
  try {
    items.value = await api('/api/queue')
    loaded.value = true
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed'
  }
}

/** Brand colour per source; anything else gets the API teal, as before. */
function badgeClass(source: QueueSource) {
  return isChatSource(source) ? `badge-${source}` : 'badge-api'
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
  <div class="flex flex-col gap-5 pb-12">
    <div class="page-head">
      <h1>Queue</h1>
      <div class="tools">
        <button class="btn btn-primary" type="button" @click="addOpen = true">Add URL</button>
      </div>
    </div>
    <div class="queue">
      <div v-if="error" class="state state-error" role="alert">
        <span class="state-tag label">error</span>
        <p class="state-text">{{ error }}</p>
      </div>
      <!-- Rows from the last successful poll stay listed under the error, as before. -->
      <div v-else-if="!loaded" class="state state-loading" role="status">
        <span class="state-tag label">loading</span>
        <p class="state-text">Loading…</p>
      </div>
      <div v-else-if="!items.length" class="state state-empty" role="status">
        <span class="state-tag label">empty</span>
        <p class="state-text">Queue is empty</p>
      </div>
      <article v-for="item in items" :key="item.id" class="q-row" :class="`q-${item.status}`">
        <span class="q-status label">{{ item.status }}</span>
        <div class="q-main">
          <div class="q-top">
            <div class="q-info">
              <div class="q-url-line">
                <p class="q-url truncate" :title="item.url">{{ item.url }}</p>
                <span
                  v-if="item.source_label"
                  class="badge label"
                  :class="badgeClass(item.source)"
                >{{ item.source_label }}</span>
              </div>
              <p class="q-meta label">{{ item.downloader }} · {{ item.status }}</p>
            </div>
            <div class="q-actions">
              <button
                v-if="isActive(item.status)"
                class="btn btn-sm"
                type="button"
                @click="cancel(item.id)"
              >Cancel</button>
              <button
                v-if="!isChatSource(item.source) && (item.status === 'failed' || item.status === 'cancelled')"
                class="btn btn-sm"
                type="button"
                @click="retry(item)"
              >Retry</button>
              <button class="btn btn-sm btn-danger" type="button" @click="remove(item.id)">Remove</button>
            </div>
          </div>
          <DownloadProgress :status="item.status" :progress="item.progress" />
          <p v-if="item.error" class="q-error">{{ item.error }}</p>
        </div>
      </article>
    </div>
    <AddUrlModal v-model:open="addOpen" @done="load" />
  </div>
</template>

<style scoped>
/* Brutalist queue styles (#29). */
.queue { display: flex; flex-direction: column; gap: 16px; }
.q-row {
  display: flex; min-width: 0;
  border: var(--bw) solid var(--border); background: var(--surface-1); box-shadow: 5px 5px 0 var(--shadow);
}
.q-status {
  flex: none; width: 34px; writing-mode: vertical-rl; transform: rotate(180deg);
  display: flex; align-items: center; justify-content: center; padding: 8px 0;
  border-left: var(--bw) solid var(--border); font-size: 0.65rem; color: var(--on-pop);
}
.q-pending .q-status { background: var(--pop-3); }
.q-downloading .q-status { background: var(--accent); color: var(--on-accent); }
.q-completed .q-status { background: var(--ok); color: var(--on-ok); }
.q-failed .q-status { background: var(--danger); color: var(--on-danger); }
.q-cancelled .q-status { background: var(--surface-3); color: var(--text-primary); }
.q-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
.q-top { display: flex; gap: 12px; align-items: flex-start; }
.q-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.q-url-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.q-url { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; }
.q-meta { color: var(--text-muted); text-transform: none; letter-spacing: 0.02em; }
.q-actions { display: flex; gap: 8px; flex: none; }
.q-error {
  font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; color: var(--danger);
  border-left: 6px solid var(--danger); padding-left: 8px; overflow-wrap: anywhere;
}
.q-completed .q-url, .q-cancelled .q-url { color: var(--text-secondary); }

@media (max-width: 767px) {
  .q-top { flex-direction: column; align-items: stretch; }
  .q-actions { flex-wrap: wrap; }
}
</style>
