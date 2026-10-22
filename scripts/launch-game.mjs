import { createServer as createNetServer, createConnection } from 'node:net'
import { access, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { readFileSync, openSync, closeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { appIdentity, identityPath } from './app-identity.mjs'
import { logPath } from './server-state.mjs'

const rootDirectory = fileURLToPath(new URL('../', import.meta.url))
const execute = promisify(execFile)
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
// Opt-in launcher audit. Never log the identity response (contains a stop token).
function probeTrace(data) {
  if (process.env.QUIET_HOME_DIAGNOSTICS === '1')
    console.error('[server-probe]', JSON.stringify({ at: Date.now(), ...data }))
}

export async function portIsOpen(port, host) {
  return new Promise((done) => {
    const socket = createConnection({ port, host })
    const finish = (value) => {
      socket.destroy()
      done(value)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', (error) => {
      probeTrace({ probe: 'tcp', port, host, error: error.code })
      if (error.code === 'ECONNREFUSED') return finish(false)
      // Some Windows policies deny IPv6 connections even though a listener exists.
      // Check exclusive binding instead of treating EACCES as a free port.
      socket.destroy()
      const probe = createNetServer()
      probe.once('error', (error) => {
        probeTrace({ probe: 'bind', port, host, error: error.code })
        done(!['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code))
      })
      probe.listen({ port, host, exclusive: true }, () =>
        probe.close(() => done(false)),
      )
    })
    socket.setTimeout(700, () => finish(true)) // An unresponsive listener is not a free port.
  })
}

export async function projectIdentity(root, port, host = '127.0.0.1') {
  try {
    const address = host === '::1' ? '[::1]' : host
    const response = await fetch(`http://${address}:${port}${identityPath}`, {
      signal: AbortSignal.timeout(1200),
      redirect: 'error',
    })
    if (!response.ok) {
      probeTrace({ probe: 'identity', port, host, status: response.status })
      return null
    }
    const identity = await response.json(),
      expected = appIdentity(root)
    const mismatched = Object.keys(expected).filter(
      (key) => identity[key] !== expected[key],
    )
    if (mismatched.length)
      probeTrace({ probe: 'identity-mismatch', port, host, fields: mismatched })
    return mismatched.length ? null : identity
  } catch (error) {
    probeTrace({
      probe: 'identity',
      port,
      host,
      error: error.name,
      cause: error.cause?.code,
      causes: error.cause?.errors?.map((e) => e.code),
    })
    return null
  }
}
const matchesProject = async (...args) => !!(await projectIdentity(...args))

function foreignPort(port) {
  return new Error(
    `Порт ${port} занят другой программой или сервером без маркера этого проекта. Браузер не открыт. Чужие процессы не изменялись. Проверьте программу на этом порту; другой порт автоматически не выбирается.`,
  )
}

async function ensurePage(port) {
  const url = `http://127.0.0.1:${port}/`
  const page = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  if (!page.ok || !(await page.text()).includes('/src/main.tsx'))
    throw new Error('Страница игры недоступна. Браузер не открыт.')
  const entry = await fetch(url + 'src/main.tsx', {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  if (!entry.ok)
    throw new Error('Vite не смог подготовить код игры. Браузер не открыт.')
}

// Serialize starts/stops. Windows pipe ownership follows process lifetime, not a saved PID.
export async function startupLock(root, port) {
  if (process.platform === 'win32') {
    // The kernel releases named pipes after a crash/reboot; there is no stale PID lock.
    const path = `\\\\.\\pipe\\quiet-home-${appIdentity(root).workspace}-${port}`
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      const server = createNetServer()
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(path, resolve)
        })
        return () => new Promise((resolve) => server.close(resolve))
      } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error
        await delay(150)
      }
    }
    throw new Error(
      'Другой запуск или остановка ещё выполняется. Повторите попытку.',
    )
  }
  const directory = join(root, 'node_modules/.cache')
  await mkdir(directory, { recursive: true })
  const path = join(directory, `quiet-home-launch-${port}.lock`)
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const handle = await open(path, 'wx')
      await handle.writeFile(String(process.pid))
      return async () => {
        await handle.close()
        await unlink(path)
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        const pid = Number(await readFile(path, 'utf8'))
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0)
          } catch (error) {
            if (error.code === 'ESRCH') await unlink(path)
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await delay(150)
    }
  }
  throw new Error(
    'Другой запуск ещё выполняется. Подождите и повторите попытку.',
  )
}

export async function openWindowsBrowser(url) {
  if (process.platform !== 'win32') throw new Error(`Откройте ${url} вручную.`)
  // Only the manual BAT entry point opts into this function; tests never call it.
  await execute(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process -FilePath '${url}' -ErrorAction Stop`,
    ],
    { windowsHide: true },
  )
}

export async function launchGame({
  root = rootDirectory,
  port = 5173,
  openBrowser,
  log = console.log,
  background = false,
  worker = false,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Некорректный порт сервера.')
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Требуется Node.js 22 или новее.')
  // A running project can be reused even when dependencies are being repaired.
  const expected = appIdentity(root)
  let release
  let child
  let closed = false
  let output = ''
  let spawnError
  const launcher = randomUUID()
  const logFile = logPath(root, port)
  const close = async () => {
    if (!child || closed) return
    closed = true
    if (child.exitCode !== null) return
    // Only the tree created by this call, never a process found by port or an existing server.
    if (process.platform === 'win32')
      await execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
      }).catch(() => {})
    else {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {}
    }
  }
  try {
    release = worker ? undefined : await startupLock(root, port)
    // Test a competing IPv6 listener too: localhost must not resolve to a foreign page.
    if (await portIsOpen(port, '::1')) {
      if (!(await matchesProject(root, port, '::1'))) throw foreignPort(port)
    }
    if (!(await matchesProject(root, port))) {
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
        for (const name of ['vite', ...Object.keys(pkg.dependencies ?? {})])
          await access(join(root, 'node_modules', name, 'package.json'))
      } catch {
        throw new Error(
          'Зависимости отсутствуют или установлены не полностью. Один раз выполните в папке проекта: pnpm install --frozen-lockfile. Затем снова запустите BAT-файл.',
        )
      }
      if (!(await matchesProject(root, port))) {
        if (await portIsOpen(port, '127.0.0.1')) throw foreignPort(port)
        // pnpm passes these arguments to the existing dev script; strictPort prevents fallback.
        const args = [
          'dev',
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ]
        if (background) {
          await mkdir(join(root, 'node_modules/.cache'), { recursive: true })
          const fd = openSync(logFile, 'a')
          try {
            child = spawn(
              process.execPath,
              [
                fileURLToPath(import.meta.url),
                '--worker',
                '--root',
                root,
                '--port',
                String(port),
              ],
              {
                cwd: root,
                detached: true,
                windowsHide: true,
                stdio: ['ignore', fd, fd],
                env: { ...process.env, QUIET_HOME_INSTANCE: launcher },
              },
            )
            child.unref()
          } finally {
            closeSync(fd)
          }
        } else
          child =
            process.platform === 'win32'
              ? spawn(
                  process.env.ComSpec || 'cmd.exe',
                  ['/d', '/s', '/c', `pnpm ${args.join(' ')}`],
                  {
                    cwd: root,
                    windowsHide: true,
                    windowsVerbatimArguments: true,
                    stdio: ['ignore', 'pipe', 'pipe'],
                  },
                )
              : spawn('pnpm', args, {
                  cwd: root,
                  detached: true,
                  stdio: ['ignore', 'pipe', 'pipe'],
                })
        child.once('error', (error) => {
          spawnError = error
        })
        for (const stream of [child.stdout, child.stderr].filter(Boolean))
          stream.on('data', (data) => {
            const text = data.toString()
            output = (output + text).slice(-12000)
            log(text.trimEnd())
          })
        const deadline = Date.now() + (background ? 75000 : 30000)
        while (!(await matchesProject(root, port))) {
          if (spawnError || child.exitCode !== null)
            throw new Error(
              `Не удалось запустить pnpm dev. Проверьте Node.js, pnpm и конфигурацию Vite. ${spawnError?.message ?? (background ? readFileSync(logFile, 'utf8').slice(-12000) : output)}`,
            )
          if (Date.now() >= deadline)
            throw new Error(
              `Сервер не подтвердил готовность. Проверьте сообщения Vite${background ? ': ' + logFile : ''}.`,
            )
          await delay(150)
        }
      }
    }
    // Recheck both addresses before opening localhost, including races during startup.
    if (
      (await portIsOpen(port, '::1')) &&
      !(await matchesProject(root, port, '::1'))
    )
      throw foreignPort(port)
    if (!(await matchesProject(root, port))) throw foreignPort(port)
    if (
      background &&
      child &&
      (await projectIdentity(root, port))?.launcher !== launcher
    )
      throw new Error(
        'Другой экземпляр занял порт во время запуска. Браузер не открыт.',
      )
    await ensurePage(port)
    if (release) {
      await release()
      release = undefined
    }
    const url = `http://localhost:${port}/`
    const reused = !child
    log(
      reused
        ? `Игра уже работает: ${url}. Второй сервер не запускается.`
        : background
          ? `Игра готова: ${url}. Сервер работает независимо в фоне; окно запуска закроется. Остановка: Остановить игру.bat. Лог: ${logFile}`
          : `Игра готова: ${url}. Не закрывайте это окно, пока играете. Для остановки нажмите Ctrl+C.`,
    )
    if (openBrowser) {
      try {
        await openBrowser(url)
        log('Команда открытия браузера выполнена.')
      } catch (error) {
        log(
          `Не удалось автоматически открыть браузер: ${error.message}\nСервер работает. Откройте вручную: ${url}`,
        )
      }
    } else log('Безопасный режим: браузер не открывается.')
    return {
      url,
      reused,
      identity: expected,
      pid: child?.pid,
      close: background
        ? async () => {
            if (!child) return
            const { stopGame } = await import('./stop-game.mjs')
            await stopGame({ root, port, expectedLauncher: launcher, log() {} })
          }
        : close,
    }
  } catch (error) {
    await close()
    throw error
  } finally {
    if (release) await release()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let server
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    // Startup may still own a child and lock; let its promise finish cleanup.
    if (!server) return
    await server?.close()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const args = process.argv.slice(2)
  const portIndex = args.indexOf('--port')
  const rootIndex = args.indexOf('--root')
  if (args.includes('--worker')) {
    process.env.QUIET_HOME_WORKER_PID = String(process.pid)
    console.log(
      `[${new Date().toISOString()}] Фоновый процесс ${process.pid}: запуск Vite.`,
    )
  }
  launchGame({
    root:
      args.includes('--worker') && rootIndex >= 0
        ? args[rootIndex + 1]
        : rootDirectory,
    port: portIndex < 0 ? 5173 : Number(args[portIndex + 1]),
    background: !args.includes('--worker'),
    worker: args.includes('--worker'),
    openBrowser:
      args.includes('--open-browser') && !args.includes('--no-browser')
        ? openWindowsBrowser
        : undefined,
  })
    .then(async (result) => {
      server = result
      if (stopping) {
        await server.close()
        process.exitCode = 0
      }
    })
    .catch((error) => {
      console.error(`\nОшибка: ${error.message}`)
      process.exitCode = 1
    })
}
