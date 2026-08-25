<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'

interface ApiKeyRow {
  id: string
  name: string
  permission: string
  created_at: string
  last_used_at: string | null
  key?: string
}

const keys = ref<ApiKeyRow[]>([])
const name = ref('')
const permission = ref<'read' | 'read_write'>('read_write')
const created = ref<ApiKeyRow | null>(null)

async function load() {
  keys.value = await api('/api/api-keys')
}

async function create() {
  created.value = await api('/api/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name: name.value, permission: permission.value }),
  })
  name.value = ''
  await load()
}

async function revoke(id: string) {
  await api(`/api/api-keys/${id}`, { method: 'DELETE' })
  await load()
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-4 max-w-xl">
    <form class="flex flex-col gap-2" @submit.prevent="create">
      <input v-model="name" required placeholder="Key name" class="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm" />
      <select v-model="permission" class="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm">
        <option value="read">read</option>
        <option value="read_write">read_write</option>
      </select>
      <button type="submit" class="self-start bg-accent text-white px-4 py-2 rounded-lg text-sm">Create key</button>
    </form>
    <div v-if="created?.key" class="bg-accent-subtle border border-accent rounded-xl p-3 text-sm">
      New key (copy now): <code class="break-all">{{ created.key }}</code>
    </div>
    <div v-for="k in keys" :key="k.id" class="bg-surface-1 border border-border rounded-xl p-3 flex items-center gap-3 text-sm">
      <div class="flex-1">
        <p class="font-medium">{{ k.name }}</p>
        <p class="text-xs text-text-muted">{{ k.permission }} · {{ k.created_at }}</p>
      </div>
      <button class="text-xs text-rose-400" @click="revoke(k.id)">Revoke</button>
    </div>
  </div>
</template>
