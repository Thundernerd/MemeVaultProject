import { onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import { useActionError } from '@/composables/useActionError'

type Settings = Record<string, string> & { _overridden_by_env?: string[] }

export function useSettings() {
  const settings = reactive<Record<string, string>>({})
  const overridden = ref<string[]>([])
  const saved = ref(false)

  /** Copies a settings response into the form and the env-override list. */
  function apply(data: Settings) {
    overridden.value = data._overridden_by_env || []
    for (const [k, v] of Object.entries(data)) {
      if (k !== '_overridden_by_env') settings[k] = String(v ?? '')
    }
  }

  async function load() {
    apply(await api<Settings>('/api/settings'))
  }

  // Shares the save error's tag, so a failed first load shows where a failed save would.
  const { error, attempt, load: initialLoad } = useActionError(load)

  async function save(keys: string[]) {
    saved.value = false
    await attempt('Save failed', async () => {
      const body: Record<string, string> = {}
      for (const k of keys) body[k] = settings[k] ?? ''
      apply(await api<Settings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      }))
      saved.value = true
    })
  }

  function isOverridden(key: string) {
    return overridden.value.includes(key)
  }

  onMounted(initialLoad)

  return { settings, save, isOverridden, saved, error, load }
}
