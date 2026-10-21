import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { createServer as httpServer } from 'node:http'
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  launchGame,
  projectIdentity,
  startupLock,
} from '../scripts/launch-game.mjs'
import { stopGame } from '../scripts/stop-game.mjs'
import {
  readState,
  writeState,
  statePath,
  logPath,
} from '../scripts/server-state.mjs'
import { appIdentity, stopPath } from '../scripts/app-identity.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const execute = promisify(execFile)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function freePort() {
  const s = createServer()
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  const port = s.address().port
  await new Promise((r) => s.close(r))
  return port
}
function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
async function gone(port) {
  await assert.rejects(
    fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }),
  )
}
function batch(name, port, directory = root) {
  const flags = name === 'Остановить игру.bat' ? '--no-pause' : '--no-browser'
  const child = spawn(
    process.env.ComSpec,
    [
      '/d',
      '/s',
      '/c',
      `call "${join(directory, name)}" ${flags} --port ${port}`,
    ],
    {
      cwd: join(root, 'docs'),
      windowsHide: true,
      windowsVerbatimArguments: true,
    },
  )
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (s) => {
    output += s
  })
  child.stderr.setEncoding('utf8').on('data', (s) => {
    output += s
  })
  child.stdin.end('\r\n')
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve({ pid: child.pid, code, output }))
  })
}

test(
  'real Windows start CMD exits, server survives, stop BAT ends its worker, and restart works',
  { skip: process.platform !== 'win32' },
  async () => {
    const port = await freePort()
    try {
      const started = await batch('Запустить игру.bat', port)
      assert.equal(started.code, 0, started.output)
      assert.equal(
        alive(started.pid),
        false,
        'CMD must be gone before the HTTP check',
      )
      assert.match(started.output, /независимо в фоне/)
      await delay(500)
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
      const original = await projectIdentity(root, port)
      assert.ok(alive(original.workerPid))
      assert.ok(alive(original.pid))
      const again = await batch('Запустить игру.bat', port)
      assert.equal(again.code, 0, again.output)
      assert.match(again.output, /Игра уже работает/)
      assert.deepEqual(await projectIdentity(root, port), original)
      const stopped = await batch('Остановить игру.bat', port)
      assert.equal(stopped.code, 0, stopped.output)
      assert.match(stopped.output, /Игра остановлена/)
      await gone(port)
      assert.equal(alive(original.pid), false)
      assert.equal(alive(original.workerPid), false)
      const repeatedStop = await batch('Остановить игру.bat', port)
      assert.equal(repeatedStop.code, 0)
      assert.match(repeatedStop.output, /уже остановлена/)
      const restarted = await batch('Запустить игру.bat', port)
      assert.equal(restarted.code, 0, restarted.output)
      assert.notEqual(
        (await projectIdentity(root, port)).instance,
        original.instance,
      )
      assert.equal((await batch('Остановить игру.bat', port)).code, 0)
      await gone(port)
    } finally {
      await stopGame({ port, log() {} })
    }
  },
)

test('simultaneous background launches create one instance and keep the stop token out of the log/marker', async () => {
  const port = await freePort()
  const results = await Promise.allSettled(
    [0, 1, 2].map(() => launchGame({ port, background: true, log() {} })),
  )
  try {
    assert.ok(
      results.every((r) => r.status === 'fulfilled'),
      JSON.stringify(results),
    )
    assert.equal(results.filter((r) => !r.value.reused).length, 1)
    const record = await readState(root, port),
      identity = await projectIdentity(root, port)
    assert.equal(record.pid, identity.pid)
    assert.equal(record.instance, identity.instance)
    const release = await startupLock(root, port)
    let reusedFinished = false
    const pendingReuse = launchGame({ port, background: true, log() {} }).then(
      (r) => {
        reusedFinished = true
        return r
      },
    )
    try {
      await delay(200)
      assert.equal(
        reusedFinished,
        false,
        'reuse must wait for an active stop/start lock',
      )
    } finally {
      await release()
    }
    assert.equal((await pendingReuse).reused, true)
    assert.equal(identity.stopToken, undefined)
    assert.ok(
      !(await readFile(logPath(root, port), 'utf8')).includes(record.stopToken),
    )
    await results.find((r) => r.value.reused).value.close()
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
  } finally {
    await stopGame({ port, log() {} })
  }
})

test('stale, reused, missing or corrupt PID records never stop an unrelated process or live mismatched instance', async () => {
  const port = await freePort()
  const server = await launchGame({ port, log() {} })
  const record = await readState(root, port)
  try {
    for (const wrong of [
      { ...record, pid: process.pid },
      { ...record, instance: 'previous-boot-instance' },
      { ...record, workspace: 'different-project' },
      { ...record, stopToken: '0'.repeat(64) },
    ]) {
      await writeState(root, port, wrong)
      await assert.rejects(
        stopGame({ port, log() {} }),
        /устарела|не подтвердил/,
      )
      assert.equal((await fetch(server.url)).status, 200)
      assert.equal(alive(process.pid), true)
    }
    await writeFile(statePath(root, port), '{broken')
    await assert.rejects(stopGame({ port, log() {} }), /устарела/)
    const unauth = await fetch(`http://127.0.0.1:${port}${stopPath}`, {
      method: 'POST',
    })
    assert.equal(unauth.status, 403)
    assert.equal((await fetch(server.url)).status, 200)
  } finally {
    await writeState(root, port, record)
    await server.close()
  }
})

test('a previous-boot PID and obsolete live-PID lock do not prevent a new background start', async () => {
  const port = await freePort()
  await mkdir(join(root, 'node_modules/.cache'), { recursive: true })
  await writeState(root, port, {
    ...appIdentity(root),
    pid: process.pid,
    instance: 'old-boot',
    stopToken: '0'.repeat(64),
  })
  if (process.platform === 'win32')
    await writeFile(
      join(root, `node_modules/.cache/quiet-home-launch-${port}.lock`),
      String(process.pid),
    )
  assert.equal((await stopGame({ port, log() {} })).stopped, false)
  const server = await launchGame({ port, background: true, log() {} })
  try {
    assert.notEqual((await readState(root, port)).instance, 'old-boot')
    assert.equal(alive(process.pid), true)
  } finally {
    await server.close()
  }
})

test(
  'foreign port is preserved by both BAT files, even with a forged stale PID file',
  { skip: process.platform !== 'win32' },
  async () => {
    const foreign = httpServer((_, r) =>
      r.end('<title>Тихий дом</title>foreign'),
    )
    await new Promise((r) => foreign.listen(0, '127.0.0.1', r))
    const port = foreign.address().port
    try {
      await writeState(root, port, {
        ...appIdentity(root),
        pid: process.pid,
        instance: 'stale',
        stopToken: '0'.repeat(64),
      })
      for (const bat of ['Запустить игру.bat', 'Остановить игру.bat']) {
        const result = await batch(bat, port)
        assert.equal(result.code, 1, result.output)
        assert.match(result.output, /занят другой программой/)
        assert.ok(
          !result.output.includes('Команда открытия браузера выполнена'),
        )
        assert.match(
          await (await fetch(`http://127.0.0.1:${port}`)).text(),
          /foreign/,
        )
      }
    } finally {
      await new Promise((r) => foreign.close(r))
    }
  },
)

test(
  'unexpected worker-tree exit leaves a harmless stale record and allows restart',
  { skip: process.platform !== 'win32' },
  async () => {
    const port = await freePort()
    const first = await launchGame({ port, background: true, log() {} })
    const identity = await projectIdentity(root, port)
    assert.equal(identity.workerPid, first.pid)
    // Only the freshly created, verified test-owned worker tree. Never a PID read from disk.
    await execute('taskkill.exe', ['/PID', String(first.pid), '/T', '/F'], {
      windowsHide: true,
    })
    await gone(port)
    const second = await launchGame({ port, background: true, log() {} })
    try {
      assert.notEqual(
        (await projectIdentity(root, port)).instance,
        identity.instance,
      )
      await assert.rejects(first.close(), /устарела/)
      assert.equal((await fetch(second.url)).status, 200)
    } finally {
      await second.close()
    }
  },
)

test(
  'successful BAT start/stop works from another cwd with Cyrillic, spaces and ampersand in the project path',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await mkdtemp(join(root, 'artifacts/фон & игра '))
    for (const name of ['scripts', 'src'])
      await cp(join(root, name), join(directory, name), { recursive: true })
    for (const name of [
      'package.json',
      'vite.config.ts',
      'index.html',
      'Запустить игру.bat',
      'Остановить игру.bat',
    ])
      await cp(join(root, name), join(directory, name))
    await symlink(
      join(root, 'node_modules'),
      join(directory, 'node_modules'),
      'junction',
    )
    const port = await freePort()
    try {
      const result = await batch('Запустить игру.bat', port, directory)
      assert.equal(result.code, 0, result.output)
      assert.equal(
        (await projectIdentity(directory, port)).workspace,
        appIdentity(directory).workspace,
      )
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/src/main.tsx`)).status,
        200,
      )
      const stopped = await batch('Остановить игру.bat', port, directory)
      assert.equal(stopped.code, 0, stopped.output)
      await gone(port)
    } finally {
      await stopGame({ root: directory, port, log() {} })
    }
  },
)

test('invalid Vite startup reports its log and leaves no listening background server', async () => {
  const directory = await mkdtemp(join(root, 'artifacts/background-invalid-'))
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ type: 'module', scripts: { dev: 'vite' } }),
  )
  await writeFile(
    join(directory, 'vite.config.mjs'),
    "throw new Error('background-config-fixture')",
  )
  await symlink(
    join(root, 'node_modules'),
    join(directory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  const port = await freePort()
  await assert.rejects(
    launchGame({ root: directory, port, background: true, log() {} }),
    /background-config-fixture/,
  )
  await gone(port)
})

test(
  'unexpected Vite exit also ends its background owner and a fresh start succeeds',
  { skip: process.platform !== 'win32' },
  async () => {
    const port = await freePort()
    const first = await launchGame({ port, background: true, log() {} })
    const identity = await projectIdentity(root, port)
    assert.equal(identity.workerPid, first.pid)
    process.kill(identity.pid, 'SIGTERM') // Only this test's freshly identified Vite.
    const deadline = Date.now() + 5000
    while (alive(first.pid) && Date.now() < deadline) await delay(100)
    assert.equal(alive(first.pid), false)
    await gone(port)
    const next = await launchGame({ port, background: true, log() {} })
    try {
      assert.notEqual(
        (await projectIdentity(root, port)).instance,
        identity.instance,
      )
    } finally {
      await next.close()
    }
  },
)
