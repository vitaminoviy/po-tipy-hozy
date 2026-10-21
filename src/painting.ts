import type { Room } from './cleaning'
import { MASK_SIZE } from './wiping'

export const PAINT_THRESHOLD = 0.95
export const paintColors = {
  cream: { name: 'Кремовый', hex: '#E9D8BA' },
  sage: { name: 'Шалфейный', hex: '#A7B7A1' },
  terracotta: { name: 'Терракотовый', hex: '#CA8E78' },
} as const
export type PaintColor = keyof typeof paintColors
// Faces follow the existing House geometry. Local U is horizontal, V is up.
// Cutaway walls keep their original height; openings include frame/sill margins.
export type PaintWall = {
  id: string
  room: Room
  x: number
  y: number
  z: number
  w: number
  h: number
  angle: number
  holes?: { x: number; y: number; w: number; h: number }[]
}
export const paintWalls: PaintWall[] = [
  {
    id: 'wall-living',
    room: 'living',
    x: -4.902,
    y: 1.51,
    z: 0,
    w: 6.8,
    h: 2.98,
    angle: Math.PI / 2,
  },
  {
    id: 'wall-bedroom',
    room: 'bedroom',
    x: 0.098,
    y: 1.51,
    z: -1.355,
    w: 4.11,
    h: 2.98,
    angle: Math.PI / 2,
    holes: [{ x: -2.055, y: 1.2 - 1.51, w: 0.1, h: 2.4 }],
  },
  {
    id: 'living-partition',
    room: 'living',
    x: -0.098,
    y: 1.51,
    z: -1.355,
    w: 4.11,
    h: 2.98,
    angle: -Math.PI / 2,
    holes: [{ x: 2.055, y: 1.2 - 1.51, w: 0.1, h: 2.4 }],
  },
  ...(['living', 'bedroom'] as Room[]).map((room, i) => ({
    id: room + '-rear',
    room,
    x: i ? 2.5 : -2.5,
    y: 1.61,
    z: -3.402,
    w: 4.82,
    h: 2.78,
    angle: 0,
    holes: [
      { x: 0, y: 1.8 - 1.61, w: 2.3, h: 1.5 },
      { x: 0, y: 1.06 - 1.61, w: 2.5, h: 0.1 },
    ],
  })),
  {
    id: 'bedroom-east',
    room: 'bedroom',
    x: 4.902,
    y: 0.37,
    z: 0,
    w: 6.8,
    h: 0.7,
    angle: -Math.PI / 2,
  },
  {
    id: 'living-front',
    room: 'living',
    x: -1.705,
    y: 0.29,
    z: 3.402,
    w: 6.41,
    h: 0.54,
    angle: Math.PI,
  },
  {
    id: 'bedroom-front',
    room: 'bedroom',
    x: 4.055,
    y: 0.29,
    z: 3.402,
    w: 1.71,
    h: 0.54,
    angle: Math.PI,
  },
  ...(['living', 'bedroom'] as Room[]).map((room, i) => ({
    id: room + '-door-top',
    room,
    x: i ? 0.098 : -0.098,
    y: 2.75,
    z: 1.55,
    w: 1.7,
    h: 0.5,
    angle: i ? Math.PI / 2 : -Math.PI / 2,
  })),
  ...(['living', 'bedroom'] as Room[]).map((room, i) => ({
    id: room + '-partition-front',
    room,
    x: i ? 0.098 : -0.098,
    y: 0.37,
    z: 2.93,
    w: 0.96,
    h: 0.7,
    angle: i ? Math.PI / 2 : -Math.PI / 2,
  })),
]
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
export const onWall = (wall: PaintWall, p: PaintPoint) =>
  Math.abs(p.x) <= wall.w / 2 + 1e-9 &&
  Math.abs(p.y) <= wall.h / 2 + 1e-9 &&
  !wall.holes?.some(
    (h) => Math.abs(p.x - h.x) <= h.w / 2 && Math.abs(p.y - h.y) <= h.h / 2,
  )
export const pixelPoint = (wall: PaintWall, i: number): PaintPoint => ({
  x: (((i % MASK_SIZE) + 0.5) / MASK_SIZE - 0.5) * wall.w,
  y: (0.5 - (Math.floor(i / MASK_SIZE) + 0.5) / MASK_SIZE) * wall.h,
})
export const paintFraction = (mask: Uint8Array, wall?: PaintWall) => {
  let area = 0,
    covered = 0
  for (let i = 0; i < mask.length; i++)
    if (!wall || onWall(wall, pixelPoint(wall, i))) {
      area++
      covered += mask[i]
    }
  return area ? covered / (255 * area) : 0
}
export const paintComplete = (mask: Uint8Array, wall?: PaintWall) =>
  paintFraction(mask, wall) >= PAINT_THRESHOLD
export function fillPaint(mask: Uint8Array, wall: PaintWall) {
  for (let i = 0; i < mask.length; i++)
    mask[i] = onWall(wall, pixelPoint(wall, i)) ? 255 : 0
}
export const wallLocal = (
  wall: PaintWall,
  world: { x?: number; y: number; z: number },
): PaintPoint => ({
  x:
    Math.cos(wall.angle) * ((world.x ?? wall.x) - wall.x) -
    Math.sin(wall.angle) * (world.z - wall.z),
  y: world.y - wall.y,
})
export const wallWorld = (wall: PaintWall, p: PaintPoint) => ({
  x: wall.x + Math.cos(wall.angle) * p.x,
  y: wall.y + p.y,
  z: wall.z - Math.sin(wall.angle) * p.x,
})
export const paintedArea = (states: PaintState[], room: Room) => {
  let area = 0,
    covered = 0
  for (const wall of paintWalls.filter((w) => w.room === room)) {
    const count = Array.from({ length: MASK_SIZE ** 2 }, (_, i) =>
      onWall(wall, pixelPoint(wall, i)) ? 1 : 0,
    ).reduce<number>((a, b) => a + b, 0)
    const size = (wall.w * wall.h * count) / MASK_SIZE ** 2
    area += size
    const state = states.find((s) => s.id === wall.id)
    if (state) covered += size * paintFraction(state.mask, wall)
  }
  return area ? covered / area : 0
}

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
  // Stop at the first opening too: a fast pointer exit into a window must not
  // erase the valid tail or reconnect the next stroke across the opening.
  for (const hole of wall.holes ?? []) {
    let enter = 0,
      exit = 1
    for (const [origin, delta, lo, hi] of [
      [from.x, dx, hole.x - hole.w / 2, hole.x + hole.w / 2],
      [from.y, dy, hole.y - hole.h / 2, hole.y + hole.h / 2],
    ]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin < lo || origin > hi) {
          enter = 2
          break
        }
      } else {
        const a = (lo - origin) / delta,
          b = (hi - origin) / delta
        enter = Math.max(enter, Math.min(a, b))
        exit = Math.min(exit, Math.max(a, b))
      }
    }
    if (enter <= exit && enter >= 0 && enter <= 1)
      t = Math.min(t, Math.max(0, enter - 1e-7))
  }
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
      if (!onWall(wall, { x, y })) continue
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
  const wall = paintWalls.find((w) => w.id === before.id)
  if (!wall) return null
  if (
    !(color in paintColors) ||
    mask.length !== MASK_SIZE ** 2 ||
    (before.color && before.color !== color) ||
    paintComplete(
      before.mask,
      paintWalls.find((w) => w.id === before.id),
    )
  )
    return null
  if (
    mask.some((v, i) => v < before.mask[i]) ||
    !mask.some((v, i) => v > before.mask[i])
  )
    return null
  const next = mask.slice()
  for (let i = 0; i < next.length; i++)
    if (!onWall(wall, pixelPoint(wall, i))) next[i] = 0
  if (!next.some((v, i) => v > before.mask[i])) return null
  if (paintComplete(next, wall)) fillPaint(next, wall)
  return { id: before.id, color, mask: next }
}
