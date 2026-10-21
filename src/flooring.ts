import type { Room } from './cleaning'
import { collisionBounds, type Item } from './placement'
import { basis, type Point } from './planarGeometry'
export const floorMaterials = {
  oak: {
    name: 'Светлый дуб',
    colors: ['#d9bd87', '#d1b17d', '#e1c797'],
    seam: '#907b58',
  },
  walnut: {
    name: 'Тёмный орех',
    colors: ['#77543d', '#684934', '#856048'],
    seam: '#49392c',
  },
  tile: {
    name: 'Тёплая плитка',
    colors: ['#d7c9af', '#e0d3ba', '#d5c4a6'],
    seam: '#aa9c83',
  },
} as const
export type FloorMaterial = keyof typeof floorMaterials
export type FloorCell = {
  x: number
  z: number
  w: number
  d: number
  area: number
}
export type FloorState = {
  room: Room
  original: 'original-planks'
  material: FloorMaterial | null
  laid: Uint8Array
  complete: boolean
}
export const FLOOR_FINISH_THRESHOLD = 0.9
export const FLOOR_MIN_MANUAL = 0.4
// Inner faces of House wall bodies; door posts remain above the thin floor layer. Passage halves meet exactly at X=0.
export function floorRegions(room: Room) {
  return [
    {
      left: room === 'living' ? -4.91 : 0.09,
      right: room === 'living' ? -0.09 : 4.91,
      back: -3.41,
      front: 3.41,
    },
    {
      left: room === 'living' ? -0.09 : 0,
      right: room === 'living' ? 0 : 0.09,
      back: 0.75,
      front: 2.35,
    },
    ...(room === 'bedroom'
      ? [{ left: 1.7, right: 3.1, back: 3.41, front: 3.5 }]
      : []),
  ]
}
export function floorRoom(p: Point): Room | null {
  for (const room of ['living', 'bedroom'] as Room[])
    if (
      floorRegions(room).some(
        (r) =>
          p.x >= r.left && p.x <= r.right && p.z >= r.back && p.z <= r.front,
      )
    )
      return room
  return null
}
const grids = new Map<string, FloorCell[]>()
export function floorCells(room: Room, material: FloorMaterial): FloorCell[] {
  const key = room + material
  let result = grids.get(key)
  if (result) return result
  result = []
  const width = material === 'tile' ? 0.56 : 1.2,
    depth = material === 'tile' ? 0.56 : 0.32
  const origin = room === 'living' ? -4.91 : 0.09
  for (const r of floorRegions(room))
    for (let row = 0; row < 22; row++) {
      const back = -3.41 + row * depth,
        front = back + depth
      if (back >= r.front || front <= r.back) continue
      const offset = material === 'tile' ? 0 : ((row % 2) * width) / 2
      for (let col = -1; col < Math.ceil(5 / width) + 1; col++) {
        const left = Math.max(r.left, origin + col * width - offset),
          right = Math.min(r.right, origin + (col + 1) * width - offset),
          b = Math.max(back, r.back),
          f = Math.min(front, r.front)
        if (right - left > 1e-8 && f - b > 1e-8)
          result.push({
            x: (left + right) / 2,
            z: (b + f) / 2,
            w: right - left,
            d: f - b,
            area: (right - left) * (f - b),
          })
      }
    }
  grids.set(key, result)
  return result
}
export const createFloors = (): FloorState[] =>
  ['living', 'bedroom'].map((room) => ({
    room: room as Room,
    original: 'original-planks',
    material: null,
    laid: new Uint8Array(),
    complete: false,
  }))
export function floorProgress(state: FloorState) {
  if (!state.material) return 0
  const cells = floorCells(state.room, state.material)
  return (
    cells.reduce((sum, c, i) => sum + (state.laid[i] ? c.area : 0), 0) /
    cells.reduce((sum, c) => sum + c.area, 0)
  )
}
function intersects(c: FloorCell, a: Point, b: Point) {
  let low = 0,
    high = 1
  for (const [v, delta, min, max] of [
    [a.x, b.x - a.x, c.x - c.w / 2, c.x + c.w / 2],
    [a.z, b.z - a.z, c.z - c.d / 2, c.z + c.d / 2],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (v < min || v > max) return false
      continue
    }
    let t1 = (min - v) / delta,
      t2 = (max - v) / delta
    if (t1 > t2) [t1, t2] = [t2, t1]
    low = Math.max(low, t1)
    high = Math.min(high, t2)
    if (low > high) return false
  }
  return true
}
// Test the whole swept segment, independent of pointer sample frequency.
export function laySegment(
  laid: Uint8Array,
  room: Room,
  material: FloorMaterial,
  a: Point,
  b: Point,
) {
  if (
    floorRoom(a) !== room ||
    floorRoom(b) !== room ||
    Math.hypot(b.x - a.x, b.z - a.z) < 1e-6
  )
    return false
  const cells = floorCells(room, material)
  if (laid.length !== cells.length) return false
  // Break paths through partition posts even when both ends belong to this room.
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.025)
  for (let i = 1; i < n; i++)
    if (
      floorRoom({
        x: a.x + ((b.x - a.x) * i) / n,
        z: a.z + ((b.z - a.z) * i) / n,
      }) !== room
    )
      return false
  let changed = false
  for (let i = 0; i < cells.length; i++)
    if (!laid[i] && intersects(cells[i], a, b)) {
      laid[i] = 1
      changed = true
    }
  return changed
}
const accessibility = new WeakMap<Item[], Map<FloorCell[], number[]>>()
export function accessibleAreas(cells: FloorCell[], items: Item[]) {
  let cache = accessibility.get(items)
  if (!cache) {
    cache = new Map()
    accessibility.set(items, cache)
  }
  const saved = cache.get(cells)
  if (saved) return saved
  const blockers = items
    .filter((i) => !i.surfaceId)
    .map((i) => {
      const bounds = collisionBounds(i).oriented
      return { ...bounds, ...basis(bounds.angle) }
    })
  const free = cells.map((cell) => {
    const nx = Math.max(1, Math.ceil(cell.w / 0.1)),
      nz = Math.max(1, Math.ceil(cell.d / 0.1))
    let count = 0
    for (let x = 0; x < nx; x++)
      for (let z = 0; z < nz; z++) {
        const px = cell.x + ((x + 0.5) / nx - 0.5) * cell.w,
          pz = cell.z + ((z + 0.5) / nz - 0.5) * cell.d
        const covered = blockers.some((r) => {
          const dx = px - r.x,
            dz = pz - r.z
          return r.circle
            ? Math.hypot(dx, dz) <= r.w / 2
            : Math.abs(r.c * dx - r.s * dz) <= r.w / 2 &&
                Math.abs(r.s * dx + r.c * dz) <= r.d / 2
        })
        if (!covered) count++
      }
    return (cell.area * count) / (nx * nz)
  })
  cache.set(cells, free)
  return free
}
export function finishFloor(
  before: FloorState,
  material: FloorMaterial,
  laid: Uint8Array,
  items: Item[],
  visible?: Float32Array,
): FloorState | null {
  if (
    !(material in floorMaterials) ||
    before.complete ||
    (before.material && before.material !== material)
  )
    return null
  const cells = floorCells(before.room, material)
  if (
    laid.length !== cells.length ||
    laid.some((v, i) => v > 1 || (before.laid[i] ?? 0) > v) ||
    !laid.some((v, i) => v !== (before.laid[i] ?? 0))
  )
    return null
  if (
    visible &&
    (visible.length !== cells.length ||
      visible.some(
        (v, i) => !Number.isFinite(v) || v < 0 || v > cells[i].area + 1e-6,
      ))
  )
    return null
  const next = { ...before, material, laid: laid.slice(), complete: false }
  const free = visible
      ? Array.from(visible, (v, i) => Math.min(v, cells[i].area))
      : accessibleAreas(cells, items),
    available = free.reduce((a, b) => a + b, 0),
    done = free.reduce((a, b, i) => a + (laid[i] ? b : 0), 0)
  if (
    available > 0 &&
    done / available >= FLOOR_FINISH_THRESHOLD &&
    floorProgress(next) >= FLOOR_MIN_MANUAL
  ) {
    next.complete = true
    next.laid.fill(1)
  }
  return next
}
