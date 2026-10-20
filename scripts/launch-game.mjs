import { createServer as createNetServer } from 'node:net'
import { access } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const rootDirectory = fileURLToPath(new URL('../', import.meta.url))
const execute = promisify(execFile)

async function assertFreePort(port, host) {
  await new Promise((resolvePort, reject) => {
    const probe = createNetServer()
    probe.once('error', (error) => {
      if (
        ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code) &&
        host === '::1'
      )
        resolvePort()
      else
        reject(
          new Error(
            `Порт ${port} занят или недоступен (${host}). Закройте прежний сервер/программу и повторите запуск. Другая страница не будет открыта.`,
            { cause: error },
          ),
        )
    })
    probe.listen({ port, host, exclusive: true }, () =>
      probe.close(resolvePort),
    )
  })
}

export async function openWindowsBrowser(url) {
  if (process.platform !== 'win32')
    throw new Error(
      `Автоматическое открытие предназначено для Windows. Откройте ${url} вручную.`,
    )
  // Fixed loopback URL, never interpolated user input or a filesystem path.
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
  openBrowser = openWindowsBrowser,
  log = console.log,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Некорректный порт сервера.')
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Требуется Node.js 22 или новее.')
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    for (const name of ['vite', ...Object.keys(pkg.dependencies)])
      await access(join(root, 'node_modules', name, 'package.json'))
  } catch {
    throw new Error(
      'Зависимости отсутствуют или установлены не полностью. Один раз откройте терминал в папке проекта и выполните: pnpm install --frozen-lockfile. Затем снова запустите BAT-файл.',
    )
  }
  await assertFreePort(port, '127.0.0.1')
  await assertFreePort(port, '::1')
  const url = `http://localhost:${port}/`
  const { createServer } = await import(
    pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href
  )
  const nonce = randomUUID(),
    probePath = `/__launch_ready_${nonce}`
  const server = await createServer({
    root,
    plugins: [
      {
        name: 'hozy-launch-readiness',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (request.url !== probePath) return next()
            response.setHeader('Cache-Control', 'no-store')
            response.end(nonce)
          })
        },
      },
    ],
    server: { host: '127.0.0.1', port, strictPort: true, open: false },
    clearScreen: false,
  })
  try {
    await server.listen()
    const response = await fetch(url + probePath.slice(1), {
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok || (await response.text()) !== nonce)
      throw new Error(
        'Не удалось подтвердить готовность именно этого сервера. Браузер не открыт.',
      )
    const page = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!page.ok || !(await page.text()).includes('/src/main.tsx'))
      throw new Error(
        'Сервер запустился, но страница игры недоступна. Браузер не открыт.',
      )
    const entry = await fetch(url + 'src/main.tsx', {
      signal: AbortSignal.timeout(15000),
    })
    if (!entry.ok)
      throw new Error(
        'Vite не смог подготовить код игры. Проверьте сообщения в этом окне. Браузер не открыт.',
      )
  } catch (error) {
    await server.close()
    throw new Error(`Не удалось запустить игру: ${error.message}`, {
      cause: error,
    })
  }
  log(`Игра готова: ${url}`)
  log(
    'Не закрывайте это окно, пока играете. Для остановки сервера нажмите Ctrl+C или закройте окно.',
  )
  try {
    await openBrowser(url)
    log('Команда открытия браузера выполнена.')
  } catch (error) {
    log(
      `Не удалось автоматически открыть браузер: ${error.message}\nСервер работает. Откройте вручную: ${url}`,
    )
  }
  return server
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let server
  const stop = async () => {
    await server?.close()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  launchGame()
    .then((result) => {
      server = result
    })
    .catch((error) => {
      console.error(`\nОшибка: ${error.message}`)
      process.exit(1)
    })
}
