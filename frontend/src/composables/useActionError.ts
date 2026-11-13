import { computed, ref } from 'vue'
import { errorMessage } from '@/api'

/**
 * The error for a page whose actions act straight away (delete, cancel, upload, revoke, save).
 * `load` runs `fetch`; a failure shows "Load failed: <message>" until a later load succeeds.
 * `attempt` runs one action and then loads; a failure shows "<prefix>: <message>" until the next
 * action starts, so the reload after it (or a poll) does not clear it. `error` shows the load
 * error first.
 */
export function useActionError(fetch: () => Promise<void>) {
  const loadError = ref('')
  const actionError = ref('')

  async function load() {
    try {
      await fetch()
      loadError.value = ''
    } catch (e) {
      loadError.value = `Load failed: ${messageOf(e)}`
    }
  }

  /** Pass `reload: false` when the action's own response already updates the page. */
  async function attempt(prefix: string, action: () => Promise<unknown>, { reload = true } = {}) {
    actionError.value = ''
    try {
      await action()
    } catch (e) {
      actionError.value = `${prefix}: ${messageOf(e)}`
    }
    if (reload) await load()
  }

  /** A failing load wins: it means the page is stale, which matters more than an earlier action's failure. */
  const error = computed(() => loadError.value || actionError.value)

  return { error, attempt, load }
}

/** Falls back to the thrown value itself, so a non-`Error` rejection still says something. */
export const messageOf = (e: unknown) => errorMessage(e, String(e))
