import { onMounted, reactive, ref } from 'vue'
import { api } from '@/api'

type Settings = Record<string, string> & { _overridden_by_env?: string[] }

export function useSettings() {
  const settings = reactive<Record<string, string>>({})
  const overridden = ref<string[]>([])
  const saved = ref(false)
  const error = ref('')

  async function load() {
    const data = await api<Settings>('/api/settings')
    overridden.value = data._overridden_by_env || []
    for (const [k, v] of Object.entries(data)) {
      if (k !== '_overridden_by_env') settings[k] = String(v ?? '')
    }
  }

  async function save(keys: string[]) {
    error.value = ''
    saved.value = false
    try {
      const body: Record<string, string> = {}
      for (const k of keys) body[k] = settings[k] ?? ''
      const data = await api<Settings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      overridden.value = data._overridden_by_env || []
      for (const [k, v] of Object.entries(data)) {
        if (k !== '_overridden_by_env') settings[k] = String(v ?? '')
      }
      saved.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Save failed'
    }
  }

  function isOverridden(key: string) {
    return overridden.value.includes(key)
  }

  onMounted(load)

  return { settings, save, isOverridden, saved, error, load }
}
