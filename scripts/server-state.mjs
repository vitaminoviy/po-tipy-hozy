import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function statePath(root, port) {
  return join(root, 'node_modules/.cache', `quiet-home-server-${port}.json`)
}
export function logPath(root, port) {
  return join(root, 'node_modules/.cache', `quiet-home-server-${port}.log`)
}
export async function readState(root, port) {
  try {
    return JSON.parse(await readFile(statePath(root, port), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
}
export async function writeState(root, port, state) {
  const path = statePath(root, port)
  await mkdir(join(root, 'node_modules/.cache'), { recursive: true })
  const temporary = `${path}.${state.instance}.tmp`
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 })
  await rename(temporary, path)
}
