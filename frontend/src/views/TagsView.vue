<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type TagWithCount } from '@/api'

const tags = ref<TagWithCount[]>([])
const error = ref('')

async function load() {
  try {
    tags.value = await api('/api/tags')
    error.value = ''
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
  <div class="flex flex-col gap-5 pb-12">
    <div class="page-head">
      <h1>Tags</h1>
      <div class="tools">
        <button class="btn" type="button" @click="purgeOrphans">Purge unused</button>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="tag-groups">
      <section v-for="[ns, list] in grouped" :key="ns" class="tag-group">
        <h2 class="tag-ns">
          <span>{{ ns }}</span>
          <span class="label text-text-muted">{{ list.length }}</span>
        </h2>
        <div class="tag-list">
          <div v-for="t in list" :key="t.id" class="tag" :class="{ 'tag-unused': !t.usage_count }">
            <span class="tag-name" :title="t.name">{{ t.name }}</span>
            <span class="tag-count" :title="`${t.usage_count} items`">{{ t.usage_count }}</span>
            <button class="tag-del" type="button" :aria-label="`Delete tag ${t.name}`" @click="remove(t.id)">✕</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Ported from prototypes/brutalist/styles.css (tags). */
.error { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; color: var(--danger); }
.tag-groups { display: flex; flex-direction: column; gap: 28px; }
.tag-group { display: flex; flex-direction: column; gap: 12px; }
.tag-ns { display: flex; align-items: baseline; gap: 10px; padding-bottom: 6px; border-bottom: var(--bw) solid var(--border); }
.tag-list { display: flex; flex-wrap: wrap; gap: 12px; }
.tag {
  display: flex; align-items: stretch; max-width: 100%; min-width: 0;
  border: var(--bw) solid var(--border); background: var(--surface-1); box-shadow: 3px 3px 0 var(--shadow);
  font-family: var(--font-mono); font-size: 0.82rem; font-weight: 700;
}
.tag-name { padding: 6px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.tag-count {
  padding: 6px 8px; background: var(--pop-1); color: var(--on-pop);
  border-left: var(--bw) solid var(--border); font-variant-numeric: tabular-nums;
}
.tag-unused { border-style: dashed; box-shadow: none; }
.tag-unused .tag-count { background: var(--surface-3); color: var(--text-primary); }
.tag-del {
  border: 0; border-left: var(--bw) solid var(--border); background: var(--surface-2); color: var(--text-primary);
  cursor: pointer; padding: 0 10px; font-weight: 900;
}
.tag-del:hover { background: var(--danger); color: var(--on-danger); }
.tag-del:focus-visible { outline: var(--bw) dashed var(--accent); outline-offset: 3px; }
</style>
