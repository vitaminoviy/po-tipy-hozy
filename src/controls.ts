import {
  placementCandidate,
  validatePlacement,
  drawerSpecs,
  isSmall,
  type Item,
} from './placement'
import type { Interaction } from './history'

export const CAMERA_SPEED = 5.5
export const CAMERA_FAST_SPEED = 13.2
export const CAMERA_MIN_POLAR = 0.35
export const CAMERA_MAX_POLAR = 1.3

export function primaryInteraction(item?: Item): Interaction | null {
  if (!item) return null
  if (item.kind === 'lamp') return { kind: 'lamp' }
  if (isSmall(item)) return { kind: 'take' }
  const drawers = drawerSpecs(item)
  if (!drawers.length) return null
  const opened = drawers.findIndex((_, index) => item.drawers?.[index])
  return { kind: 'drawer', index: opened < 0 ? 0 : opened }
}

export function isEditing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest('input, textarea, select, [contenteditable="true"]'))
  )
}
export function inputOwner(draft: Item | null) {
  return draft ? 'furniture' : 'camera'
}
// Exact integral of exponential acceleration, rather than velocity * dt after
// smoothing. Equal held-key time covers equal distance at different FPS.
export function smoothAxis(value: number, target: number, dt: number) {
  const decay = Math.exp(-14 * dt)
  return {
    velocity: target + (value - target) * decay,
    distance: target * dt + ((value - target) * (1 - decay)) / 14,
  }
}
// Horizontal basis: forward points from camera toward its target.
export function movement(
  keys: ReadonlySet<string>,
  forward: { x: number; z: number },
) {
  const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
  const vertical = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
  const length = Math.hypot(horizontal, vertical) || 1
  return {
    x: (-forward.z * horizontal + forward.x * vertical) / length,
    z: (forward.x * horizontal + forward.z * vertical) / length,
  }
}
// Sweep short steps, retain a raw accumulator independently of the soft snap.
// An invalid preview never becomes the origin of the next movement step.
export function keyboardPlacement(
  item: Item,
  dx: number,
  dz: number,
  items: Item[],
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.025))
  let raw = item,
    preview = item
  let hasValidOrigin = !validatePlacement(
    placementCandidate(raw, raw.x, raw.z),
    items,
  )
  for (let i = 0; i < steps; i++) {
    const next = { ...raw, x: raw.x + dx / steps, z: raw.z + dz / steps }
    preview = placementCandidate(next, next.x, next.z)
    const error = validatePlacement(preview, items)
    if (error && hasValidOrigin) break
    raw = next
    if (!error) hasValidOrigin = true
  }
  return { raw, preview }
}
