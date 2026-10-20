import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'

export const identityPath = '/__quiet-home_identity'

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
  return {
    name: 'quiet-home-identity',
    apply: 'serve',
    configResolved(config) {
      identity = appIdentity(config.root)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== identityPath) return next()
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(identity))
      })
    },
  }
}
