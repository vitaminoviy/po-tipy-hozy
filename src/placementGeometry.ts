import { partsOnSurface, upholsteredParts } from './furnitureGeometry'
import { panelToSurface } from './grounding'
import {
  catalog,
  drawerSpecs,
  DRAWER_TRAVEL,
  type Item,
  type Kind,
} from './placement'

export type SurfaceZone = {
  id: string
  height: number
  size: [number, number]
  centerX: number
  center: number
}
export type CollisionVolume = {
  p: [number, number, number]
  s: [number, number, number]
  circle?: boolean
}

// Derive anchors from the unchanged rendering primitives. A new supported part
// only needs to be listed here; its dimensions/height are never copied by hand.
export function softSurfaceZones(kind: Kind): SurfaceZone[] {
  if (kind !== 'bed' && kind !== 'sofa' && kind !== 'chair') return []
  const ids =
    kind === 'bed'
      ? ['blanket', 'fold', 'mattress']
      : kind === 'chair'
        ? ['seat']
        : ['seat--0.53', 'seat-0.53']
  return ids.map((id) => {
    const part = upholsteredParts[kind].find((part) => part.id === id)!
    return {
      id,
      height: part.p[1] + part.s[1] / 2,
      size: [part.s[0], part.s[2]],
      centerX: part.p[0],
      center: part.p[2],
    }
  })
}

export function furnitureVolumes(item: Item, floor: number): CollisionVolume[] {
  const box = (
    p: CollisionVolume['p'],
    s: CollisionVolume['s'],
  ): CollisionVolume => ({ p, s })
  const grounded = (p: CollisionVolume['p'], s: CollisionVolume['s']) =>
    panelToSurface(p, s, floor)
  let parts: CollisionVolume[] = []
  switch (item.kind) {
    case 'sofa':
    case 'chair':
    case 'bed':
      return partsOnSurface(item.kind, floor)
    case 'table':
      return [
        box([0, 0.53, 0], [1.35, 0.13, 0.85]),
        ...[-0.5, 0.5].flatMap((x) =>
          [-0.28, 0.28].map((z) => box([x, 0.25, z], [0.09, 0.5, 0.09])),
        ),
      ]
    case 'cabinet':
      parts = [
        ...[-0.71, 0.71].map((x) => grounded([x, 0.65, 0], [0.08, 1.1, 0.65])),
        box([0, 0.65, -0.3], [1.34, 1.1, 0.05]),
        ...[0.12, 0.47, 0.82].map((y) => box([0, y, 0], [1.34, 0.03, 0.65])),
        box([0, 1.24, 0], [1.58, 0.09, 0.72]),
      ]
      break
    case 'nightstand':
      parts = [
        ...[-0.325, 0.325].map((x) => grounded([x, 0.4, 0], [0.05, 0.7, 0.6])),
        grounded([0, 0.4, -0.275], [0.6, 0.7, 0.05]),
        grounded([0, 0.2, 0], [0.6, 0.3, 0.6]),
        box([0, 0.78, 0], [0.76, 0.08, 0.7]),
      ]
      break
    case 'lamp':
      return [
        { ...box([0, 0.05, 0], [0.6, 0.1, 0.6]), circle: true },
        box([0, 0.8, 0], [0.035, 1.5, 0.035]),
        { ...box([0, 1.55, 0], [0.64, 0.4, 0.64]), circle: true },
      ]
    case 'plant':
      return [
        { ...box([0, 0.24, 0], [0.54, 0.48, 0.54]), circle: true },
        box([0, 0.7, 0], [0.04, 0.75, 0.04]),
        ...Array.from({ length: 7 }, (_, i) => ({
          ...box(
            [
              Math.sin(i * 2.4) * 0.18,
              0.63 + i * 0.09,
              Math.cos(i * 2.4) * 0.17,
            ],
            [0.46, 0.46, 0.46],
          ),
          circle: true,
        })),
      ]
    default: {
      const [w, d] = catalog[item.kind].size
      return [
        box(
          [0, catalog[item.kind].height / 2, 0],
          [w, catalog[item.kind].height, d],
        ),
      ]
    }
  }
  drawerSpecs(item).forEach(({ y, width, depth, center }, index) => {
    const z = center + (item.drawers?.[index] ? DRAWER_TRAVEL : 0)
    parts.push(
      box([0, y, z + depth / 2 + 0.015], [width, 0.28, 0.03]),
      box([0, y, z + depth / 2 + 0.04], [width > 1 ? 0.22 : 0.13, 0.035, 0.04]),
      box([0, y - 0.105, z], [width - 0.08, 0.03, depth]),
      ...[-1, 1].map((side) =>
        box([side * (width / 2 - 0.06), y - 0.005, z], [0.04, 0.2, depth]),
      ),
      box([0, y - 0.005, z - depth / 2], [width - 0.08, 0.2, 0.035]),
    )
  })
  return parts
}

export function smallVolumes(item: Item): CollisionVolume[] {
  if (item.kind === 'cup')
    return [
      { p: [0, 0.0855, 0], s: [0.18, 0.171, 0.18], circle: true },
      { p: [0.085, 0.105, 0], s: [0.076, 0.076, 0.02] },
    ]
  const [w, d] = catalog[item.kind].size,
    h = catalog[item.kind].height
  return [{ p: [0, h / 2, 0], s: [w, h, d] }]
}
