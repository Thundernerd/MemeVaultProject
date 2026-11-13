<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useActionError } from './useActionError'
import SaveRow from './SaveRow.vue'

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

const { error, attempt, initialLoad } = useActionError(load)

async function create() {
  // Hide the last key so it isn't shown next to a failed create as if it were the new one.
  created.value = null
  await attempt('Create failed', async () => {
    created.value = await api('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: name.value, permission: permission.value }),
    })
    name.value = ''
  })
}

async function revoke(id: string) {
  await attempt('Revoke failed', () => api(`/api/api-keys/${id}`, { method: 'DELETE' }))
}

onMounted(initialLoad)
</script>

<template>
  <div class="stack-lg">
    <p class="help">
      The key name is shown as a badge on queue items submitted via
      <code>POST /api/v1/submit</code>.
      Pass <code>includeInRandom: true</code> to add the item to random selection when it finishes.
    </p>
    <form class="settings-form" @submit.prevent="create">
      <input v-model="name" required placeholder="Key name (e.g. Extra tool)" class="input" />
      <select v-model="permission" class="select">
        <option value="read">read</option>
        <option value="read_write">read_write</option>
      </select>
      <SaveRow label="Create key" :error="error" />
    </form>
    <div v-if="created?.key" class="reveal">
      <p class="label">New key (copy now)</p>
      <code class="reveal-key">{{ created.key }}</code>
    </div>
    <div class="cards">
      <div v-for="k in keys" :key="k.id" class="panel">
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <p class="key-name truncate">{{ k.name }}</p>
          <p class="mono-sm text-text-muted">
            <span class="pill label" :class="k.permission === 'read' ? 'pill-off' : 'pill-ok'">{{ k.permission }}</span>
            {{ k.created_at }}
          </p>
        </div>
        <button type="button" class="btn btn-sm btn-danger" @click="revoke(k.id)">Revoke</button>
      </div>
    </div>
  </div>
</template>
