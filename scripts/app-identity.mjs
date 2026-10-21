import {
  createHash,
  randomUUID,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { realpathSync } from 'node:fs'
import { writeState } from './server-state.mjs'

export const identityPath = '/__quiet-home_identity'
export const stopPath = '/__quiet-home_stop'

export function appIdentity(root) {
  const canonical = realpathSync(root)
  return {
    app: 'vitaminoviy/po-tipy-hozy',
    protocol: 1,
    workspace: createHash('sha256')
      .update(
        process.platform === 'win32' ? canonical.toLowerCase() : canonical,
      )
      .digest('hex'),
  }
}

// Development only. A public marker, not a credential; no local path is exposed.
export function appIdentityPlugin() {
  let identity
  let root
  return {
    name: 'quiet-home-identity',
    apply: 'serve',
    configResolved(config) {
      root = config.root
      identity = appIdentity(config.root)
    },
    configureServer(server) {
      const instance = randomUUID()
      const stopToken = randomBytes(32).toString('hex')
      const processIdentity = {
        ...identity,
        instance,
        pid: process.pid,
        ...(process.env.QUIET_HOME_WORKER_PID
          ? { workerPid: Number(process.env.QUIET_HOME_WORKER_PID) }
          : {}),
        ...(process.env.QUIET_HOME_INSTANCE
          ? { launcher: process.env.QUIET_HOME_INSTANCE }
          : {}),
      }
      let port
      let ready
      const registered = new Promise((resolve) => {
        ready = resolve
      })
      server.httpServer.once('listening', async () => {
        port = server.httpServer.address().port
        try {
          await writeState(root, port, {
            ...processIdentity,
            stopToken,
            startedAt: new Date().toISOString(),
          })
          ready(true)
        } catch (error) {
          server.config.logger.error(
            `Не удалось сохранить состояние сервера: ${error.message}`,
          )
          ready(false)
        }
      })
      server.middlewares.use(async (request, response, next) => {
        if (![identityPath, stopPath].includes(request.url)) return next()
        const available = await registered
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        if (request.url === identityPath) {
          if (!available) response.statusCode = 503
          response.end(JSON.stringify(processIdentity))
          return
        }
        const supplied = Buffer.from(request.headers.authorization || '')
        const expected = Buffer.from(`Bearer ${stopToken}`)
        if (
          !available ||
          request.method !== 'POST' ||
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        ) {
          response.statusCode = 403
          response.end(JSON.stringify({ error: 'Остановка не разрешена' }))
          return
        }
        response.statusCode = 202
        response.end(JSON.stringify({ stopping: instance }))
        // Respond first; then let Vite close watchers, HTTP/WebSocket and build workers.
        setImmediate(() => {
          void server
            .close()
            .then(() => {
              process.exit(0)
            })
            .catch((error) => {
              server.config.logger.error(`Ошибка остановки: ${error.message}`)
            })
        })
      })
    },
  }
}
