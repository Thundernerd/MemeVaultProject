import { ref } from 'vue'
import { errorMessage } from '@/api'

/**
 * The error tag for a settings tab. `attempt` runs one action that acts straight away (upload,
 * delete, create, revoke), then reloads the tab; a failure shows "<prefix>: <message>" and the
 * next successful action clears it. `initialLoad` runs `reload` alone for the tab's first load
 * and shows "Load failed: <message>" instead of leaving an unhandled rejection.
 */
export function useActionError(reload: () => Promise<void>) {
  const error = ref('')

  async function attempt(prefix: string, action: () => Promise<unknown>) {
    try {
      await action()
      error.value = ''
    } catch (e) {
      error.value = `${prefix}: ${messageOf(e)}`
    }
    try {
      await reload()
    } catch (e) {
      // Keep the action's own error if there is one; otherwise say the refresh failed.
      error.value ||= `Reload failed: ${messageOf(e)}`
    }
  }

  async function initialLoad() {
    try {
      await reload()
      // No clearing on success: an action may have failed while this load was in flight.
    } catch (e) {
      error.value = `Load failed: ${messageOf(e)}`
    }
  }

  return { error, attempt, initialLoad }
}

/** Falls back to the thrown value itself, so a non-`Error` rejection still says something. */
export const messageOf = (e: unknown) => errorMessage(e, String(e))
