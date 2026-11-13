// The `@` import alias is defined once, in tsconfig.app.json `paths`.
// These tests drive Vite's dev server through its public API and check how it
// rewrites `@/…` imports.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'

const frontendDir = fileURLToPath(new URL('..', import.meta.url))

async function transform(root, url) {
  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false, watch: null },
    // Pre-bundling deps is irrelevant here and leaves close() pending.
    optimizeDeps: { noDiscovery: true },
  })
  try {
    const result = await server.transformRequest(url)
    assert.ok(result, `Vite returned nothing for ${url}`)
    return result.code
  } finally {
    await server.close()
  }
}

test('dev server rewrites @/ imports in src/router.ts to /src/', async () => {
  const code = await transform(frontendDir, '/src/router.ts')
  assert.match(code, /["']\/src\/layouts\/MainLayout\.vue["']/)
})

test('changing @/* in tsconfig.app.json changes what Vite resolves', async () => {
  // A copy of this project with a different @/* target. Not under node_modules:
  // Vite does not apply tsconfig paths to files inside node_modules.
  const root = await mkdtemp(path.join(tmpdir(), 'alias-fixture-'))
  try {
    // So the copied config's plugin imports resolve.
    await symlink(path.join(frontendDir, 'node_modules'), path.join(root, 'node_modules'), 'dir')
    await cp(path.join(frontendDir, 'vite.config.ts'), path.join(root, 'vite.config.ts'))
    await cp(path.join(frontendDir, 'tsconfig.json'), path.join(root, 'tsconfig.json'))
    await cp(path.join(frontendDir, 'tsconfig.node.json'), path.join(root, 'tsconfig.node.json'))
    await writeFile(
      path.join(root, 'tsconfig.app.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./lib/*'] } },
        include: ['src/**/*.ts', 'lib/**/*.ts'],
      }),
    )
    await mkdir(path.join(root, 'src'))
    await mkdir(path.join(root, 'lib'))
    await writeFile(path.join(root, 'lib', 'greeting.ts'), "export const greeting = 'hi'\n")
    await writeFile(
      path.join(root, 'src', 'main.ts'),
      "import { greeting } from '@/greeting'\nconsole.log(greeting)\n",
    )

    const code = await transform(root, '/src/main.ts')
    assert.match(code, /["']\/lib\/greeting\.ts["']/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
