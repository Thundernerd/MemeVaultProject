import { ref } from 'vue'
import { errorMessage } from '@/api'

/**
 * The error tag for a settings tab whose buttons act straight away (upload, delete, create, revoke).
 * `attempt` runs one action, then reloads the tab. A failure shows "<prefix>: <message>";
 * the next successful action clears it.
 */
export function useActionError(reload: () => Promise<void>) {
  const error = ref('')

  async function attempt(prefix: string, action: () => Promise<unknown>) {
    try {
      await action()
      error.value = ''
    } catch (e) {
      error.value = `${prefix}: ${errorMessage(e, String(e))}`
    }
    try {
      await reload()
    } catch (e) {
      // Keep the action's own error if there is one; otherwise say the refresh failed.
      error.value ||= `Reload failed: ${errorMessage(e, String(e))}`
    }
  }

  return { error, attempt }
}
