import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appIdentity, stopPath } from './app-identity.mjs'
import { portIsOpen, projectIdentity, startupLock } from './launch-game.mjs'
import { readState } from './server-state.mjs'

const rootDirectory = fileURLToPath(new URL('../', import.meta.url))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const alive = (pid) => {
  if (!Number.isInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code !== 'ESRCH'
  }
}

export async function stopGame({
  root = rootDirectory,
  port = 5173,
  log = console.log,
  expectedLauncher,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Некорректный порт сервера.')
  const release = await startupLock(root, port)
  try {
    const identity = await projectIdentity(root, port)
    if (!identity) {
      if (
        (await portIsOpen(port, '127.0.0.1')) ||
        (await portIsOpen(port, '::1'))
      )
        throw new Error(
          `Порт ${port} занят другой программой. Чужие процессы не изменялись.`,
        )
      log(
        'Игра уже остановлена. Устаревшая запись PID не используется для завершения процессов.',
      )
      return { stopped: false }
    }
    const record = await readState(root, port)
    const expected = appIdentity(root)
    if (
      !record ||
      !Object.keys(expected).every((k) => record[k] === expected[k]) ||
      !Number.isInteger(record.pid) ||
      record.pid !== identity.pid ||
      record.workerPid !== identity.workerPid ||
      !record.instance ||
      record.instance !== identity.instance ||
      !/^[a-f0-9]{64}$/.test(record.stopToken) ||
      (expectedLauncher && identity.launcher !== expectedLauncher)
    )
      throw new Error(
        'Запись запуска устарела или не совпадает с сервером. Остановка отменена; процессы не изменялись. Для старого сервера pnpm dev используйте Ctrl+C в его окне.',
      )
    // PID is evidence only, never a kill target. A fresh instance/token prevents PID reuse.
    const response = await fetch(`http://127.0.0.1:${port}${stopPath}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${record.stopToken}` },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    })
    if (
      response.status !== 202 ||
      (await response.json()).stopping !== record.instance
    )
      throw new Error(
        'Сервер не подтвердил остановку. Чужие процессы не изменялись.',
      )
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      if (
        !(await portIsOpen(port, '127.0.0.1')) &&
        !(await portIsOpen(port, '::1'))
      ) {
        if (alive(record.pid) || alive(record.workerPid)) {
          await delay(150)
          continue
        }
        log(
          'Игра остановлена. Сервер и фоновый процесс завершены. Можно запустить игру снова.',
        )
        return { stopped: true }
      }
      const current = await projectIdentity(root, port)
      if (current && current.instance !== record.instance)
        throw new Error(
          'Исходный сервер остановлен, но порт уже занят новым экземпляром. Новый процесс не изменялся.',
        )
      await delay(150)
    }
    throw new Error(
      'Остановка запрошена, но завершение сервера или фонового процесса ещё не подтверждено. Проверьте лог; принудительное завершение не выполнялось.',
    )
  } finally {
    await release()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2),
    index = args.indexOf('--port')
  stopGame({ port: index < 0 ? 5173 : Number(args[index + 1]) }).catch(
    (error) => {
      console.error(`Ошибка: ${error.message}`)
      process.exitCode = 1
    },
  )
}
