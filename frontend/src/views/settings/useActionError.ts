import { ref } from 'vue'

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
      error.value = `${prefix}: ${messageOf(e)}`
    }
    try {
      await reload()
    } catch (e) {
      // Keep the action's own error if there is one; otherwise say the refresh failed.
      error.value ||= `Reload failed: ${messageOf(e)}`
    }
  }

  return { error, attempt }
}

export function messageOf(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
