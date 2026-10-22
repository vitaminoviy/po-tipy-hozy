import { createHistory, type History } from './history'
import {
  initialItems,
  isSmall,
  validatePlacement,
  type Item,
} from './placement'
import { initialTrash } from './cleaning'
import { initialMask } from './wiping'
import { paintWalls, onWall, pixelPoint, paintColors } from './painting'
import { floorCells, floorMaterials } from './flooring'

export const SCHEMA_VERSION = 1
export type WorldSave = {
  schemaVersion: 1
  items: History['present']
  disposed: string[]
  dirt: History['dirt']
  paint: History['paint']
  floors: History['floors']
}
// Called only at a confirmed history boundary. IndexedDB clones these immutable
// arrays; no JSON/base64 textures and no undo snapshots enter persistent storage.
export function captureWorld(h: History): WorldSave {
  return {
    schemaVersion: SCHEMA_VERSION,
    items: h.present,
    disposed: h.trash.filter((t) => t.state === 'disposed').map((t) => t.id),
    dirt: h.dirt,
    paint: h.paint,
    floors: h.floors,
  }
}
function requireValid(ok: unknown): asserts ok {
  if (!ok)
    throw new Error('Сохранение повреждено. Данные оставлены без изменений.')
}
function bytes(value: unknown, length: number): asserts value is Uint8Array {
  requireValid(value instanceof Uint8Array && value.length === length)
}
function sameIds(values: unknown, ids: string[], key: string) {
  requireValid(Array.isArray(values) && values.length === ids.length)
  requireValid(values.every((v, i) => v && v[key] === ids[i]))
}
export function restoreWorld(input: unknown): History {
  requireValid(input && typeof input === 'object')
  const w = input as WorldSave
  if (w.schemaVersion !== SCHEMA_VERSION)
    throw new Error('Несовместимая версия сохранения. Данные не изменены.')
  const h = createHistory()
  sameIds(
    w.items,
    initialItems.map((i) => i.id),
    'id',
  )
  const allowed = new Set([
    'id',
    'kind',
    'x',
    'z',
    'rotation',
    'surfaceId',
    'surfaceZone',
    'drawerIndex',
    'drawers',
    'lampOn',
    'binRoom',
    'room',
  ])
  w.items.forEach((i, index) => {
    const base = initialItems[index]
    requireValid(Object.keys(i).every((k) => allowed.has(k)))
    requireValid(i.kind === base.kind && i.binRoom === base.binRoom)
    requireValid(
      [i.x, i.z, i.rotation].every(
        (n) =>
          typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1000,
      ),
    )
    requireValid(
      i.lampOn === undefined ||
        (i.kind === 'lamp' && typeof i.lampOn === 'boolean'),
    )
    requireValid(
      i.drawers === undefined ||
        (Array.isArray(i.drawers) &&
          i.drawers.length === 3 &&
          i.drawers.every((b) => typeof b === 'boolean') &&
          ['cabinet', 'nightstand'].includes(i.kind)),
    )
    requireValid(
      i.surfaceZone === undefined ||
        (typeof i.surfaceZone === 'string' && i.surfaceZone.length < 64),
    )
    requireValid(
      i.drawerIndex === undefined ||
        (Number.isInteger(i.drawerIndex) &&
          i.drawerIndex >= 0 &&
          i.drawerIndex < 3),
    )
    if (i.surfaceId !== undefined) {
      const parent = w.items.find((p) => p.id === i.surfaceId)
      requireValid(
        typeof i.surfaceId === 'string' &&
          isSmall(i) &&
          parent &&
          !isSmall(parent),
      )
    } else
      requireValid(i.surfaceZone === undefined && i.drawerIndex === undefined)
  })
  // Stored contents of closed drawers are valid; opening is a UI placement rule.
  const openForValidation = w.items.map((i): Item => ({
    ...i,
    drawers: i.drawers ? [true, true, true] : undefined,
  }))
  for (const i of openForValidation)
    requireValid(!validatePlacement(i, openForValidation))
  requireValid(
    Array.isArray(w.disposed) &&
      w.disposed.length <= initialTrash.length &&
      new Set(w.disposed).size === w.disposed.length &&
      w.disposed.every((id) => initialTrash.some((t) => t.id === id)),
  )
  sameIds(
    w.dirt,
    h.dirt.map((d) => d.id),
    'id',
  )
  const original = initialMask()
  for (const d of w.dirt) {
    bytes(d.mask, original.length)
    requireValid(d.mask.every((v, i) => v <= original[i]))
  }
  sameIds(
    w.paint,
    h.paint.map((p) => p.id),
    'id',
  )
  w.paint.forEach((p, index) => {
    bytes(p.mask, h.paint[index].mask.length)
    requireValid(p.color === null || Object.hasOwn(paintColors, p.color))
    requireValid(p.color !== null || !p.mask.some(Boolean))
    const wall = paintWalls[index]
    requireValid(
      p.mask.every((v, i) => !v || onWall(wall, pixelPoint(wall, i))),
    )
  })
  sameIds(w.floors, ['living', 'bedroom'], 'room')
  for (const f of w.floors) {
    requireValid(
      f.original === 'original-planks' && typeof f.complete === 'boolean',
    )
    requireValid(
      f.material === null || Object.hasOwn(floorMaterials, f.material),
    )
    bytes(f.laid, f.material ? floorCells(f.room, f.material).length : 0)
    requireValid(f.laid.every((v) => v === 0 || v === 1))
    requireValid(f.complete === (!!f.material && f.laid.every((v) => v === 1)))
  }
  // Own the restored arrays: callers cannot mutate validated state afterwards.
  const clean = structuredClone(w)
  return {
    ...h,
    present: clean.items,
    trash: h.trash.map((t) => ({
      ...t,
      state: clean.disposed.includes(t.id) ? 'disposed' : 'room',
    })),
    dirt: clean.dirt,
    paint: clean.paint,
    floors: clean.floors,
  }
}
