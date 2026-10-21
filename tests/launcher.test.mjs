import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { launchGame } from '../scripts/launch-game.mjs'
import { stopGame } from '../scripts/stop-game.mjs'
import { appIdentity, identityPath } from '../scripts/app-identity.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const execute = promisify(execFile)
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
function assertIdentity(actual) {
  for (const [key, value] of Object.entries(appIdentity(root)))
    assert.equal(actual[key], value)
  assert.ok(Number.isInteger(actual.pid))
  assert.ok(actual.instance)
}
async function fixture(prefix) {
  await mkdir(join(root, 'artifacts'), { recursive: true })
  return mkdtemp(join(root, `artifacts/launcher-${prefix}-`))
}
async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

test('fresh pnpm dev launch verifies identity and page, opens once and keeps serving', async () => {
  const port = await freePort()
  let opened = 0
  const server = await launchGame({
    port,
    log() {},
    async openBrowser(url) {
      assert.equal(url, `http://localhost:${port}/`)
      const response = await fetch(`http://127.0.0.1:${port}${identityPath}`)
      assertIdentity(await response.json())
      assert.ok((await (await fetch(url)).text()).includes('/src/main.tsx'))
      opened++
    },
  })
  try {
    assert.equal(opened, 1)
    assert.equal(server.reused, false)
    assert.ok(server.pid)
    const reused = await launchGame({
      port,
      log() {},
      openBrowser() {
        opened++
      },
    })
    assert.equal(reused.reused, true)
    assert.equal(reused.pid, undefined)
    assert.equal(opened, 2)
    await reused.close() // Must never stop the original server.
    assert.equal((await fetch(server.url)).status, 200)
  } finally {
    await server.close()
  }
})

test('simultaneous launches create only one server and each opens at most once', async () => {
  const port = await freePort()
  let opened = 0
  const results = await Promise.allSettled(
    [0, 1].map(() =>
      launchGame({
        port,
        log() {},
        openBrowser() {
          opened++
        },
      }),
    ),
  )
  try {
    assert.ok(
      results.every((result) => result.status === 'fulfilled'),
      JSON.stringify(results),
    )
    const servers = results.map((result) => result.value)
    assert.equal(servers.filter((server) => !server.reused).length, 1)
    assert.equal(opened, 2)
  } finally {
    for (const result of results)
      if (result.status === 'fulfilled') await result.value.close()
  }
})

test('foreign HTTP page including a similar title never opens or loses its server', async (t) => {
  const foreign = createHttpServer((_, response) =>
    response.end('<title>Тихий дом</title>'),
  )
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => foreign.close(resolve)))
  const port = foreign.address().port
  await assert.rejects(
    launchGame({
      port,
      log() {},
      openBrowser() {
        assert.fail('foreign page opened')
      },
    }),
    /Порт .* занят другой программой/,
  )
  assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200)
})

test('a marker for a different workspace cannot masquerade as this project', async (t) => {
  const foreign = createHttpServer((_, response) =>
    response.end(
      JSON.stringify({ ...appIdentity(root), workspace: 'different' }),
    ),
  )
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => foreign.close(resolve)))
  await assert.rejects(
    launchGame({
      port: foreign.address().port,
      log() {},
      openBrowser() {
        assert.fail('wrong workspace opened')
      },
    }),
    /занят другой программой/,
  )
})

test('a recognized server with a broken game page never opens the browser', async (t) => {
  const broken = createHttpServer((request, response) => {
    response.end(
      request.url === identityPath
        ? JSON.stringify(appIdentity(root))
        : 'game page unavailable',
    )
  })
  await new Promise((resolve) => broken.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => broken.close(resolve)))
  await assert.rejects(
    launchGame({
      port: broken.address().port,
      openBrowser() {
        assert.fail('unready page opened')
      },
    }),
    /Страница игры недоступна/,
  )
  assert.equal(broken.listening, true)
})

test('occupied IPv6 localhost port is rejected before opening any browser', async (t) => {
  const occupied = createHttpServer((_, response) => response.end('foreign'))
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
        assert.fail('wrong page opened')
      },
    }),
    /занят другой программой/,
  )
})

test('missing dependencies provide instructions without installing anything', async () => {
  const directory = await fixture('missing')
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ dependencies: { react: '*' } }),
  )
  await assert.rejects(
    launchGame({
      root: directory,
      port: await freePort(),
      openBrowser() {
        assert.fail('browser opened')
      },
    }),
    /pnpm install --frozen-lockfile/,
  )
})

test('Vite configuration failure is reported without opening a browser', async () => {
  const directory = await fixture('invalid')
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      type: 'module',
      dependencies: {},
      scripts: { dev: 'vite' },
    }),
  )
  await writeFile(
    join(directory, 'vite.config.mjs'),
    "throw new Error('launcher-config-fixture')",
  )
  await symlink(
    join(root, 'node_modules'),
    join(directory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await assert.rejects(
    launchGame({
      root: directory,
      port: await freePort(),
      log() {},
      openBrowser() {
        assert.fail('browser opened')
      },
    }),
    /launcher-config-fixture/,
  )
})

test('browser failure leaves the verified server available and prints a manual URL', async () => {
  const messages = []
  const server = await launchGame({
    port: await freePort(),
    log: (text) => messages.push(text),
    openBrowser() {
      throw new Error('browser-fixture')
    },
  })
  try {
    assert.equal((await fetch(server.url)).status, 200)
    assert.ok(messages.some((message) => message.includes('Откройте вручную:')))
  } finally {
    await server.close()
  }
})

// Always --no-browser, even for the successful Windows BAT cases.
function startBatch({
  env = process.env,
  bat = join(root, 'Запустить игру.bat'),
  port,
} = {}) {
  const child = spawn(
    process.env.ComSpec,
    ['/d', '/c', `call "${bat}" --no-browser${port ? ` --port ${port}` : ''}`],
    {
      cwd: join(root, 'docs'),
      env,
      windowsVerbatimArguments: true,
      windowsHide: true,
    },
  )
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (text) => {
    output += text
  })
  child.stderr.setEncoding('utf8').on('data', (text) => {
    output += text
  })
  child.stdin.end('\r\n')
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code, output }))
  })
  return { child, completion, getOutput: () => output }
}

test(
  'Windows BAT exits after readiness; independent server survives CMD exit, reuses and stops',
  { skip: process.platform !== 'win32' },
  async () => {
    const port = await freePort()
    const run = startBatch({ port })
    try {
      const completed = await run.completion
      assert.equal(completed.code, 0, completed.output)
      assert.equal(run.child.exitCode, 0)
      await delay(400)
      assertIdentity(
        await (await fetch(`http://127.0.0.1:${port}${identityPath}`)).json(),
      )
      assert.equal((run.getOutput().match(/Игра готова:/g) ?? []).length, 1)
      assert.ok(
        !run.getOutput().includes('Команда открытия браузера выполнена'),
      )
      // Second actual BAT: reuse the first server and exit, no second Vite or browser.
      const second = await startBatch({ port }).completion
      assert.equal(second.code, 0, second.output)
      assert.match(second.output, /Игра уже работает/)
      assert.match(second.output, /Безопасный режим/)
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
    } finally {
      await stopGame({ port, log() {} })
    }
  },
)

test(
  'Windows BAT rejects a foreign server without opening it or stopping it',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const foreign = createHttpServer((_, response) =>
      response.end('foreign site'),
    )
    await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => foreign.close(resolve)))
    const port = foreign.address().port
    const result = await startBatch({ port }).completion
    assert.equal(result.code, 1)
    assert.match(result.output, /занят другой программой/)
    assert.ok(!result.output.includes('Команда открытия браузера выполнена'))
    assert.equal(
      await (await fetch(`http://127.0.0.1:${port}`)).text(),
      'foreign site',
    )
  },
)

test(
  'Windows BAT reports missing Node and pnpm from another working directory',
  { skip: process.platform !== 'win32' },
  async () => {
    const system = join(process.env.SystemRoot, 'System32')
    const withoutNode = await startBatch({
      env: { ...process.env, PATH: system },
    }).completion
    assert.equal(withoutNode.code, 1)
    assert.match(withoutNode.output, /Не найден Node.js/)
    const withoutPnpm = await startBatch({
      env: { ...process.env, PATH: `${system};${dirname(process.execPath)}` },
    }).completion
    assert.equal(withoutPnpm.code, 1)
    assert.match(withoutPnpm.output, /Не найден pnpm/)
  },
)

test(
  'Windows BAT handles spaces, ampersand and Cyrillic in its project path',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await fixture('BAT & тест')
    await mkdir(join(directory, 'scripts'))
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dependencies: { react: '*' } }),
    )
    for (const name of [
      'launch-game.mjs',
      'app-identity.mjs',
      'server-state.mjs',
    ])
      await writeFile(
        join(directory, 'scripts', name),
        await readFile(join(root, 'scripts', name)),
      )
    const bat = join(directory, 'Запустить игру.bat')
    await writeFile(bat, await readFile(join(root, 'Запустить игру.bat')))
    const result = await startBatch({ bat, port: await freePort() }).completion
    assert.equal(result.code, 1)
    assert.match(result.output, /pnpm install --frozen-lockfile/)
  },
)
