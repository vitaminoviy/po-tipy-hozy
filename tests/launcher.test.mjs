import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { launchGame } from '../scripts/launch-game.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
// Exercise Vite in the same process isolation used by the real BAT launcher.
// Vite/esbuild may retain config watchers after server.close() in a test host.
async function scenario(body) {
  await mkdir(join(root, 'artifacts'), { recursive: true })
  const fixture = await mkdtemp(join(root, 'artifacts/launcher-scenario-'))
  const runner = join(fixture, 'run.mjs')
  await writeFile(
    runner,
    `import assert from 'node:assert/strict';
    import { launchGame } from ${JSON.stringify(pathToFileURL(join(root, 'scripts/launch-game.mjs')).href)};
    try { ${body}; process.exit(0) } catch(error) { console.error(error); process.exit(1) }`,
  )
  await promisify(execFile)(process.execPath, [runner], { timeout: 15000 })
}
async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
test('launch waits for its own working Vite page before requesting browser and leaves server running', async () => {
  const port = await freePort()
  await scenario(`let opened = 0;
    const server = await launchGame({ port: ${port}, log(){}, async openBrowser(url) {
      assert.equal(url, 'http://localhost:${port}/');
      const response = await fetch(url); assert.equal(response.status, 200);
      assert.ok((await response.text()).includes('/src/main.tsx')); opened++;
    }});
    assert.equal(opened,1); assert.equal(server.httpServer.listening,true); await server.close()`)
})
test('occupied IPv4 port never opens any browser', async (t) => {
  const occupied = createServer()
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => occupied.close(resolve)))
  let opened = false
  await assert.rejects(
    launchGame({
      port: occupied.address().port,
      openBrowser: () => {
        opened = true
      },
    }),
    /Порт .* занят/,
  )
  assert.equal(opened, false)
})
test('occupied IPv6 localhost port is also rejected before browser opening', async (t) => {
  const occupied = createServer()
  try {
    await new Promise((resolve, reject) => {
      occupied.once('error', reject)
      occupied.listen({ port: 0, host: '::1', ipv6Only: true }, resolve)
    })
  } catch (error) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code)) {
      t.skip('IPv6 unavailable')
      return
    }
    throw error
  }
  t.after(() => new Promise((resolve) => occupied.close(resolve)))
  await assert.rejects(
    launchGame({
      port: occupied.address().port,
      openBrowser() {
        assert.fail('wrong browser opening')
      },
    }),
    /Порт .* занят/,
  )
})
test('missing dependencies give installation instructions without installing anything', async () => {
  await mkdir(join(root, 'artifacts'), { recursive: true })
  const fixture = await mkdtemp(join(root, 'artifacts/launcher-missing-'))
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ dependencies: { react: '*' } }),
  )
  await assert.rejects(
    launchGame({
      root: fixture,
      openBrowser() {
        assert.fail('browser must not open')
      },
    }),
    /pnpm install --frozen-lockfile/,
  )
})
test('Vite startup failure leaves browser unopened and reports the failure', async () => {
  const fixture = await mkdtemp(join(root, 'artifacts/launcher-invalid-'))
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ type: 'module', dependencies: {} }),
  )
  await writeFile(
    join(fixture, 'vite.config.mjs'),
    "throw new Error('launcher-config-fixture')",
  )
  await symlink(
    join(root, 'node_modules'),
    join(fixture, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  const runner = join(fixture, 'failed-launch.mjs')
  await writeFile(
    runner,
    `import { launchGame } from ${JSON.stringify(pathToFileURL(join(root, 'scripts/launch-game.mjs')).href)};
    launchGame({ root: ${JSON.stringify(fixture)}, port: ${await freePort()}, openBrowser(){ throw new Error('unexpected browser') } })
      .catch(error => { console.error(error.message); process.exit(1) })`,
  )
  await assert.rejects(
    promisify(execFile)(process.execPath, [runner], { timeout: 10000 }),
    (error) => {
      assert.equal(error.code, 1)
      assert.match(error.stderr, /launcher-config-fixture/)
      return true
    },
  )
})
test('browser failure keeps a verified server available and prints its URL', async () => {
  const port = await freePort()
  await scenario(`const messages = [];
    const server = await launchGame({ port: ${port}, log: text => messages.push(text), openBrowser(){throw new Error('browser-fixture')} });
    assert.equal((await fetch('http://localhost:${port}/')).status,200);
    assert.ok(messages.some(message => message.includes('Откройте вручную:'))); await server.close()`)
})

function runBatch(env, bat = join(root, 'Запустить игру.bat')) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ComSpec, ['/d', '/c', `call "${bat}"`], {
      cwd: join(root, 'docs'),
      env,
      windowsVerbatimArguments: true,
      windowsHide: true,
    })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', (text) => {
      output += text
    })
    child.stderr.setEncoding('utf8').on('data', (text) => {
      output += text
    })
    child.stdin.end('\r\n')
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code, output }))
  })
}
test(
  'Windows BAT reports missing Node and pnpm from a different working directory',
  { skip: process.platform !== 'win32' },
  async () => {
    const system = join(process.env.SystemRoot, 'System32')
    const withoutNode = await runBatch({ ...process.env, PATH: system })
    assert.equal(withoutNode.code, 1)
    assert.match(withoutNode.output, /Не найден Node.js/)
    const withoutPnpm = await runBatch({
      ...process.env,
      PATH: `${system};${dirname(process.execPath)}`,
    })
    assert.equal(withoutPnpm.code, 1)
    assert.match(withoutPnpm.output, /Не найден pnpm/)
  },
)
test(
  'Windows BAT works in a spaced Cyrillic path and reports missing dependencies',
  { skip: process.platform !== 'win32' },
  async () => {
    const fixture = await mkdtemp(join(root, 'artifacts/launcher BAT & тест-'))
    await mkdir(join(fixture, 'scripts'))
    await writeFile(
      join(fixture, 'package.json'),
      JSON.stringify({ dependencies: { react: '*' } }),
    )
    await writeFile(
      join(fixture, 'scripts/launch-game.mjs'),
      await readFile(join(root, 'scripts/launch-game.mjs')),
    )
    const bat = join(fixture, 'Запустить игру.bat')
    await writeFile(bat, await readFile(join(root, 'Запустить игру.bat')))
    const result = await runBatch(process.env, bat)
    assert.equal(result.code, 1)
    assert.match(result.output, /pnpm install --frozen-lockfile/)
  },
)
