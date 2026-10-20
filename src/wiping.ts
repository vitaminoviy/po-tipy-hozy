import type { Room } from './cleaning'

export const MASK_SIZE = 96
export const BRUSH_RADIUS = 0.115
export const CLEAN_THRESHOLD = 0.95
export const dirtPatches = [
  {
    id: 'floor-living',
    room: 'living' as Room,
    x: -3.15,
    z: 2.45,
    w: 0.95,
    d: 0.65,
  },
  {
    id: 'floor-bedroom',
    room: 'bedroom' as Room,
    x: 1.85,
    z: 2.4,
    w: 0.95,
    d: 0.65,
  },
]
export type DirtPatch = (typeof dirtPatches)[number]
export type DirtState = { id: string; mask: Uint8Array }
export type BrushPoint = { x: number; z: number }

// Deterministic, irregular overlapping smudges; alpha is also the source of progress.
export function initialMask(): Uint8Array {
  return Uint8Array.from({ length: MASK_SIZE ** 2 }, (_, i) => {
    const x = ((i % MASK_SIZE) + 0.5) / MASK_SIZE,
      z = (Math.floor(i / MASK_SIZE) + 0.5) / MASK_SIZE
    const blobs = [
      [0.29, 0.38, 0.21, 0.19],
      [0.62, 0.57, 0.27, 0.16],
      [0.72, 0.28, 0.14, 0.13],
      [0.32, 0.72, 0.18, 0.11],
    ]
    let density = 0
    for (const [cx, cz, sx, sz] of blobs)
      density += Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2) * 1.5)
    const grain =
      0.77 + 0.14 * Math.sin(i * 12.9898) + 0.09 * Math.cos(x * 67 + z * 41)
    return Math.round(
      Math.min(210, Math.max(0, (density - 0.055) * 190 * grain)),
    )
  })
}
const original = initialMask()
const total = original.reduce((sum, a) => sum + a, 0)
export function createDirt(): DirtState[] {
  return dirtPatches.map(({ id }) => ({ id, mask: original.slice() }))
}
export function cleanFraction(mask: Uint8Array): number {
  return Math.max(
    0,
    Math.min(1, 1 - mask.reduce((sum, a) => sum + a, 0) / total),
  )
}
export function isClean(mask: Uint8Array): boolean {
  return cleanFraction(mask) >= CLEAN_THRESHOLD
}

// A swept soft brush uses distance to the entire segment, so fast input has no gaps.
// Work on a private gesture copy; history masks are immutable.
export function wipeSegment(
  mask: Uint8Array,
  patch: DirtPatch,
  from: BrushPoint,
  to: BrushPoint,
): boolean {
  const dx = to.x - from.x,
    dz = to.z - from.z
  const length2 = dx * dx + dz * dz
  if (length2 < 0.000001) return false
  let changed = false
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const x = (((i % MASK_SIZE) + 0.5) / MASK_SIZE - 0.5) * patch.w,
      z = ((Math.floor(i / MASK_SIZE) + 0.5) / MASK_SIZE - 0.5) * patch.d
    const t = Math.max(
      0,
      Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length2),
    )
    const distance = Math.hypot(x - from.x - dx * t, z - from.z - dz * t)
    if (distance >= BRUSH_RADIUS) continue
    const strength = Math.min(1, (1 - distance / BRUSH_RADIUS) * 3)
    // The brush core removes dirt completely; the feather is gradual.
    const next = Math.max(0, mask[i] - Math.round(255 * strength))
    if (next !== mask[i]) {
      mask[i] = next
      changed = true
    }
  }
  return changed
}
