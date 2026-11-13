import { onMounted, reactive, ref } from 'vue'
import { api, errorMessage } from '@/api'
import { useActionError } from './useActionError'

type Settings = Record<string, string> & { _overridden_by_env?: string[] }

export function useSettings() {
  const settings = reactive<Record<string, string>>({})
  const overridden = ref<string[]>([])
  const saved = ref(false)

  async function load() {
    const data = await api<Settings>('/api/settings')
    overridden.value = data._overridden_by_env || []
    for (const [k, v] of Object.entries(data)) {
      if (k !== '_overridden_by_env') settings[k] = String(v ?? '')
    }
  }

  // Shares the save error's tag, so a failed first load shows where a failed save would.
  const { error, initialLoad } = useActionError(load)

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
      error.value = errorMessage(e, 'Save failed')
    }
  }

  function isOverridden(key: string) {
    return overridden.value.includes(key)
  }

  onMounted(initialLoad)

  return { settings, save, isOverridden, saved, error, load }
}
