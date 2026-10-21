import type { Room } from './cleaning'
import { MASK_SIZE } from './wiping'

export const PAINT_THRESHOLD = 0.95
export const paintColors = {
  cream: { name: 'Кремовый', hex: '#E9D8BA' },
  sage: { name: 'Шалфейный', hex: '#A7B7A1' },
  terracotta: { name: 'Терракотовый', hex: '#CA8E78' },
} as const
export type PaintColor = keyof typeof paintColors
// Blank, accessible sections of the existing west wall and bedroom partition.
// Normal +X, local horizontal axis -Z, local vertical axis +Y. No openings.
export const paintWalls = [
  {
    id: 'wall-living',
    room: 'living' as Room,
    x: -4.902,
    y: 2.15,
    z: 1.35,
    w: 2.4,
    h: 1.3,
  },
  {
    id: 'wall-bedroom',
    room: 'bedroom' as Room,
    x: 0.098,
    y: 2.15,
    z: -1.65,
    w: 2.4,
    h: 1.3,
  },
]
export type PaintWall = (typeof paintWalls)[number]
export type PaintPoint = { x: number; y: number }
export type PaintState = {
  id: string
  color: PaintColor | null
  mask: Uint8Array
}
export const ROLLER_WIDTH = 0.34
export const ROLLER_HEIGHT = 0.18
export const createPaint = (): PaintState[] =>
  paintWalls.map(({ id }) => ({
    id,
    color: null,
    mask: new Uint8Array(MASK_SIZE ** 2),
  }))
export const paintFraction = (mask: Uint8Array) =>
  mask.reduce((sum, v) => sum + v, 0) / (255 * mask.length)
export const paintComplete = (mask: Uint8Array) =>
  paintFraction(mask) >= PAINT_THRESHOLD
export const wallLocal = (
  wall: PaintWall,
  world: { y: number; z: number },
): PaintPoint => ({ x: wall.z - world.z, y: world.y - wall.y })
export const onWall = (wall: PaintWall, p: PaintPoint) =>
  Math.abs(p.x) <= wall.w / 2 && Math.abs(p.y) <= wall.h / 2

// Finish only the in-bounds part of a fast exit, then break the gesture segment.
export function wallExit(
  wall: PaintWall,
  from: PaintPoint,
  to: PaintPoint,
): PaintPoint {
  const dx = to.x - from.x,
    dy = to.y - from.y
  let t = 1
  if (dx) t = Math.min(t, ((dx > 0 ? wall.w / 2 : -wall.w / 2) - from.x) / dx)
  if (dy) t = Math.min(t, ((dy > 0 ? wall.h / 2 : -wall.h / 2) - from.y) / dy)
  return {
    x: Math.max(-wall.w / 2, Math.min(wall.w / 2, from.x + dx * t)),
    y: Math.max(-wall.h / 2, Math.min(wall.h / 2, from.y + dy * t)),
  }
}

// Swept elliptical footprint: interpolate every point of a segment without
// allocating stamps/meshes. Max coverage is idempotent, including feather edges.
export function paintSegment(
  mask: Uint8Array,
  wall: PaintWall,
  from: PaintPoint,
  to: PaintPoint,
): boolean {
  if (!onWall(wall, from) || !onWall(wall, to)) return false
  const rx = ROLLER_WIDTH / 2,
    ry = ROLLER_HEIGHT / 2
  const dx = (to.x - from.x) / rx,
    dy = (to.y - from.y) / ry
  const length2 = dx * dx + dy * dy
  if (length2 < 1e-8) return false
  let changed = false
  for (let row = 0; row < MASK_SIZE; row++) {
    const y = (0.5 - (row + 0.5) / MASK_SIZE) * wall.h
    if (y < Math.min(from.y, to.y) - ry || y > Math.max(from.y, to.y) + ry)
      continue
    for (let col = 0; col < MASK_SIZE; col++) {
      const x = ((col + 0.5) / MASK_SIZE - 0.5) * wall.w
      const px = (x - from.x) / rx,
        py = (y - from.y) / ry
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / length2))
      const distance = Math.hypot(px - dx * t, py - dy * t)
      if (distance >= 1) continue
      const i = row * MASK_SIZE + col
      const next = Math.max(
        mask[i],
        Math.round(255 * Math.min(1, (1 - distance) * 5)),
      )
      if (next !== mask[i]) {
        mask[i] = next
        changed = true
      }
    }
  }
  return changed
}

export function finishPaint(
  before: PaintState,
  color: PaintColor,
  mask: Uint8Array,
): PaintState | null {
  if (
    !(color in paintColors) ||
    mask.length !== MASK_SIZE ** 2 ||
    (before.color && before.color !== color) ||
    paintComplete(before.mask)
  )
    return null
  if (
    mask.some((v, i) => v < before.mask[i]) ||
    !mask.some((v, i) => v > before.mask[i])
  )
    return null
  const next = mask.slice()
  if (paintComplete(next)) next.fill(255)
  return { id: before.id, color, mask: next }
}
