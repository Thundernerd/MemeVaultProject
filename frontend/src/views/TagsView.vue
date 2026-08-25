<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type TagWithCount } from '@/api'

const tags = ref<TagWithCount[]>([])
const error = ref('')

async function load() {
  try {
    tags.value = await api('/api/tags')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed'
  }
}

async function remove(id: string) {
  if (!confirm('Delete this tag?')) return
  await api('/api/tags', { method: 'DELETE', body: JSON.stringify({ id }) })
  await load()
}

async function purgeOrphans() {
  const orphans = tags.value.filter((t) => t.usage_count === 0)
  for (const t of orphans) {
    await api('/api/tags', { method: 'DELETE', body: JSON.stringify({ id: t.id }) })
  }
  await load()
}

const grouped = computed(() => {
  const map = new Map<string, TagWithCount[]>()
  for (const t of tags.value) {
    const ns = t.name.includes(':') ? t.name.split(':')[0] : 'other'
    if (!map.has(ns)) map.set(ns, [])
    map.get(ns)!.push(t)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
})

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-4 pb-12">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Tags</h1>
      <button class="ml-auto text-sm px-3 py-1.5 rounded-lg bg-surface-2" @click="purgeOrphans">
        Purge unused
      </button>
    </div>
    <p v-if="error" class="text-rose-400 text-sm">{{ error }}</p>
    <div v-for="[ns, list] in grouped" :key="ns" class="flex flex-col gap-2">
      <h2 class="text-sm font-medium text-text-secondary uppercase tracking-wide">{{ ns }}</h2>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="t in list"
          :key="t.id"
          class="flex items-center gap-2 bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm"
        >
          <span>{{ t.name }}</span>
          <span class="text-text-muted text-xs">{{ t.usage_count }}</span>
          <button class="text-text-muted hover:text-rose-400" @click="remove(t.id)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>
