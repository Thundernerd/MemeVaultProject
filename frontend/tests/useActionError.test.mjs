// useActionError has no DOM, so these tests load it through Vite (which resolves
// the `@/` alias and strips the types) and drive it as a plain function.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'

const frontendDir = fileURLToPath(new URL('..', import.meta.url))
let server
let useActionError

before(async () => {
  server = await createServer({
    root: frontendDir,
    configFile: path.join(frontendDir, 'vite.config.ts'),
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  })
  ;({ useActionError } = await server.ssrLoadModule('/src/composables/useActionError.ts'))
})

after(() => server?.close())

const ok = async () => {}
const fail = (message) => async () => {
  throw new Error(message)
}

test('a failing action shows "<prefix>: <message>"', async () => {
  const { error, attempt } = useActionError(ok)
  await attempt('Delete failed', fail('tag is in use'))
  assert.equal(error.value, 'Delete failed: tag is in use')
})

test('a successful load after a failed action keeps the action error', async () => {
  const { error, attempt, load } = useActionError(ok)
  await attempt('Cancel failed', fail('already finished'))
  await load()
  assert.equal(error.value, 'Cancel failed: already finished')
})

test('a failing load wins over an earlier action error', async () => {
  let fetchFails = false
  const { error, attempt, load } = useActionError(async () => {
    if (fetchFails) throw new Error('server is down')
  })
  await attempt('Remove failed', fail('not found'))
  fetchFails = true
  await load()
  assert.equal(error.value, 'Load failed: server is down')
})

test('starting the next action clears the action error', async () => {
  const { error, attempt } = useActionError(ok)
  await attempt('Retry failed', fail('bad url'))
  let errorWhileRunning
  await attempt('Retry failed', async () => {
    errorWhileRunning = error.value
  })
  assert.equal(errorWhileRunning, '')
  assert.equal(error.value, '')
})
