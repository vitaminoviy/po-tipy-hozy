import { overlaps as planarOverlap, type Planar } from './planarGeometry'
import { catalog, collisionBounds, type Item } from './placement'

export const FLOOR_TOP = 0.015
export const RUG_THICKNESS = 0.018
export const rugCenterY = (kind: Item['kind']) =>
  kind === 'bedroomRug' ? 0.03 : 0.027

// Shared contact surface for furniture panels and small floor objects.
// Moving a rug changes contact height, without attaching floor objects to it.
export function supportHeight(item: Item, items: Item[]) {
  return floorSupport(collisionBounds(item), items)
}
export function floorSupport(
  base: Planar & { oriented?: Planar },
  items: Item[],
) {
  let height = FLOOR_TOP
  for (const rug of items) {
    if (catalog[rug.kind].category !== 'floorDecor') continue
    const rugBounds = collisionBounds(rug).oriented
    if (!planarOverlap(base.oriented ?? base, rugBounds)) continue
    const y = rugCenterY(rug.kind)
    height = Math.max(height, y + RUG_THICKNESS / 2)
    const [localW, localD] = catalog[rug.kind].size
    const angle = (rug.rotation * Math.PI) / 2
    for (const side of [-1, 1]) {
      const z = side * (localD / 2 - 0.14)
      const stripe = {
        x: rug.x + Math.sin(angle) * z,
        z: rug.z + Math.cos(angle) * z,
        w: localW - 0.16,
        d: 0.045,
        angle,
      }
      if (planarOverlap(base.oriented ?? base, stripe))
        height = Math.max(height, y + 0.015)
    }
  }
  return height
}

export function panelToSurface(
  p: [number, number, number],
  s: [number, number, number],
  bottom: number,
) {
  const top = p[1] + s[1] / 2
  return {
    p: [p[0], (top + bottom) / 2, p[2]] as [number, number, number],
    s: [s[0], top - bottom, s[2]] as [number, number, number],
  }
}
