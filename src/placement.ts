import {
  axisBounds,
  planarDistance,
  overlaps,
  type Planar,
} from './planarGeometry'
import { supportHeight } from './grounding'
import { bins, type Room } from './cleaning'
import {
  softSurfaceZones,
  furnitureVolumes,
  smallVolumes,
  type CollisionVolume,
} from './placementGeometry'

export type Kind =
  | 'bin'
  | 'sofa'
  | 'table'
  | 'chair'
  | 'plant'
  | 'bed'
  | 'cabinet'
  | 'lamp'
  | 'rug'
  | 'bedroomRug'
  | 'nightstand'
  | 'book'
  | 'cup'
  | 'box'
export type Category = 'furniture' | 'floorDecor' | 'decor' | 'surfaceDecor'
export type Item = {
  id: string
  kind: Kind
  x: number
  z: number
  rotation: number // Legacy quarter-turn unit; fractions allow any angle (degrees / 90).
  surfaceId?: string
  surfaceZone?: string
  drawerIndex?: number
  drawers?: [boolean, boolean, boolean]
  lampOn?: boolean
  binRoom?: Room
}
export const catalog: Record<
  Kind,
  {
    name: string
    size: [number, number]
    color: string
    icon: string
    category: Category
    shape: 'box' | 'circle'
    height: number
    surface?: { height: number; size: [number, number] }
  }
> = {
  bin: {
    name: 'Мусорное ведро',
    size: [0.472, 0.472],
    color: '#89937f',
    icon: '▥',
    category: 'decor',
    shape: 'circle',
    height: 0.466,
  },
  sofa: {
    name: 'Диван «Мох»',
    size: [2.5, 1.1],
    color: '#60765d',
    icon: '▰',
    category: 'furniture',
    shape: 'box',
    height: 1.35,
  },
  table: {
    name: 'Журнальный стол',
    size: [1.35, 0.85],
    color: '#c0956c',
    icon: '▱',
    category: 'furniture',
    shape: 'box',
    height: 0.75,
    surface: { height: 0.595, size: [1.35, 0.85] },
  },
  chair: {
    name: 'Мягкое кресло',
    size: [1, 1],
    color: '#bc855f',
    icon: '◧',
    category: 'furniture',
    shape: 'box',
    height: 1.21,
  },
  plant: {
    name: 'Комнатное растение',
    size: [0.84, 0.84],
    color: '#638567',
    icon: '♧',
    category: 'decor',
    shape: 'circle',
    height: 1.4,
  },
  bed: {
    name: 'Кровать «Облако»',
    size: [2.08, 2.65],
    color: '#e7d9bd',
    icon: '▤',
    category: 'furniture',
    shape: 'box',
    height: 1.49,
  },
  cabinet: {
    name: 'Дубовый комод',
    size: [1.58, 0.78],
    color: '#ae8056',
    icon: '▥',
    category: 'furniture',
    shape: 'box',
    height: 1.29,
    surface: { height: 1.285, size: [1.58, 0.72] },
  },
  lamp: {
    name: 'Торшер',
    size: [0.65, 0.65],
    color: '#e1cdaa',
    icon: '♙',
    category: 'decor',
    shape: 'circle',
    height: 1.75,
  },
  rug: {
    name: 'Ковёр гостиной',
    size: [3.45, 3.45],
    color: '#899778',
    icon: '▧',
    category: 'floorDecor',
    shape: 'box',
    height: 0.018,
  },
  bedroomRug: {
    name: 'Ковёр спальни',
    size: [3.3, 4.3],
    color: '#b28f78',
    icon: '▧',
    category: 'floorDecor',
    shape: 'box',
    height: 0.018,
  },
  nightstand: {
    name: 'Прикроватная тумба',
    size: [0.76, 0.7],
    color: '#ad835c',
    icon: '▥',
    category: 'furniture',
    shape: 'box',
    height: 0.82,
    surface: { height: 0.82, size: [0.76, 0.7] },
  },
  book: {
    name: 'Книга',
    size: [0.36, 0.26],
    color: '#496f76',
    icon: '▤',
    category: 'surfaceDecor',
    shape: 'box',
    height: 0.065,
  },
  cup: {
    name: 'Чашка',
    size: [0.25, 0.22],
    color: '#e0cbaa',
    icon: '☕',
    category: 'surfaceDecor',
    shape: 'box',
    height: 0.19,
  },
  box: {
    name: 'Декоративная коробка',
    size: [0.28, 0.25],
    color: '#b27c69',
    icon: '□',
    category: 'surfaceDecor',
    shape: 'box',
    height: 0.214,
  },
}
export const categoryNames: Record<Category, string> = {
  furniture: 'Мебель',
  floorDecor: 'Напольный декор',
  decor: 'Декор',
  surfaceDecor: 'На поверхности',
}
export const initialItems: Item[] = [
  { id: 'sofa', kind: 'sofa', x: -2.8, z: -2.45, rotation: 0 },
  { id: 'table', kind: 'table', x: -2.8, z: -0.4, rotation: 0 },
  { id: 'chair', kind: 'chair', x: -4, z: 1.6, rotation: 1 },
  { id: 'plant', kind: 'plant', x: -0.8, z: -2.7, rotation: 0 },
  { id: 'bed', kind: 'bed', x: 2.8, z: -1.65, rotation: 0 },
  { id: 'cabinet', kind: 'cabinet', x: 4, z: 2.65, rotation: 0 },
  { id: 'lamp', kind: 'lamp', x: 4.25, z: -2.7, rotation: 0 },
  { id: 'rug', kind: 'rug', x: -2.7, z: -0.1, rotation: 0 },
  { id: 'bedroom-rug', kind: 'bedroomRug', x: 2.6, z: -0.35, rotation: 0 },
  { id: 'nightstand', kind: 'nightstand', x: 1.05, z: -2.6, rotation: 0 },
  {
    id: 'book',
    kind: 'book',
    x: -0.27,
    z: -0.15,
    rotation: 0,
    surfaceId: 'table',
  },
  { id: 'cup', kind: 'cup', x: 0.34, z: 0.13, rotation: 0, surfaceId: 'table' },
  { id: 'box', kind: 'box', x: -0.35, z: 0, rotation: 0, surfaceId: 'cabinet' },
  ...bins.map((bin) => ({
    ...bin,
    kind: 'bin' as const,
    binRoom: bin.room,
    rotation: 0,
  })),
]
export const isSmall = (item: Item) =>
  catalog[item.kind].category === 'surfaceDecor'
export const itemName = (item: Item) =>
  item.kind === 'bin'
    ? item.binRoom === 'living'
      ? 'Ведро гостиной'
      : 'Ведро спальни'
    : catalog[item.kind].name
export type WorldItem = Item & { y: number }
export const DRAWER_TRAVEL = 0.28
export function drawerSpecs(item: Item) {
  return item.kind === 'cabinet'
    ? [0.3, 0.65, 1].map((y) => ({
        y,
        width: 1.38,
        depth: 0.54,
        inner: [1.22, 0.46] as [number, number],
        height: 0.24,
        center: 0.06,
      }))
    : item.kind === 'nightstand'
      ? [
          {
            y: 0.5,
            width: 0.61,
            depth: 0.48,
            inner: [0.45, 0.4] as [number, number],
            height: 0.2,
            center: 0.05,
          },
        ]
      : []
}
export function support(item: Item, parent: Item) {
  if (item.drawerIndex === undefined) {
    const zones = softSurfaceZones(parent.kind)
    if (zones.length) {
      const zone = item.surfaceZone
        ? zones.find((zone) => zone.id === item.surfaceZone)
        : zones[0]
      return (
        zone && {
          ...zone,
          type: 'soft' as const,
          lift: 0.001,
          open: true,
          clearance: Infinity,
        }
      )
    }
    const top = catalog[parent.kind].surface
    return (
      top && {
        ...top,
        center: 0,
        centerX: 0,
        type: 'hard' as const,
        lift: 0.006,
        open: true,
        clearance: Infinity,
      }
    )
  }
  const drawer = drawerSpecs(parent)[item.drawerIndex]
  return (
    drawer && {
      height: drawer.y - 0.09,
      size: drawer.inner,
      centerX: 0,
      type: 'drawer' as const,
      lift: 0.006,
      center:
        drawer.center +
        (parent.drawers?.[item.drawerIndex] ? DRAWER_TRAVEL : 0),
      open: !!parent.drawers?.[item.drawerIndex],
      clearance: drawer.height,
    }
  )
}
export function surfaceAnchors(
  parent: Item,
): Pick<Item, 'surfaceZone' | 'drawerIndex'>[] {
  const zones = softSurfaceZones(parent.kind)
  return [
    ...(zones.length
      ? zones.map((zone) => ({
          surfaceZone: zone.id,
          drawerIndex: undefined,
        }))
      : [
          {
            surfaceZone: undefined,
            drawerIndex: undefined,
          },
        ]),
    ...drawerSpecs(parent).map((_, drawerIndex) => ({
      surfaceZone: undefined,
      drawerIndex,
    })),
  ]
}
export function worldPose(item: Item, items: Item[]): WorldItem {
  const parent = items.find((i) => i.id === item.surfaceId),
    surface = parent && support(item, parent)
  if (!surface || !parent)
    return {
      ...item,
      y: isSmall(item) ? supportHeight(item, items) + 0.001 : 0,
    }
  const angle = (parent.rotation * Math.PI) / 2,
    c = Math.cos(angle),
    s = Math.sin(angle)
  return {
    ...item,
    x:
      parent.x + c * (item.x + surface.centerX) + s * (item.z + surface.center),
    z:
      parent.z - s * (item.x + surface.centerX) + c * (item.z + surface.center),
    y: surface.height + surface.lift,
    rotation: (parent.rotation + item.rotation) % 4,
  }
}
export function surfaceLocal(
  parent: Item,
  x: number,
  z: number,
): { x: number; z: number } {
  const angle = (parent.rotation * Math.PI) / 2,
    c = Math.cos(angle),
    s = Math.sin(angle),
    dx = x - parent.x,
    dz = z - parent.z
  return { x: c * dx - s * dz, z: s * dx + c * dz }
}
export function validateSurfacePlacement(
  item: Item,
  items: Item[],
): string | null {
  const parent = items.find((i) => i.id === item.surfaceId),
    surface = parent && support(item, parent)
  if (!surface) return 'Нужна подходящая поверхность или открытый ящик'
  if (!surface.open) return 'Сначала откройте ящик'
  if (catalog[item.kind].height + 0.006 > surface.clearance)
    return 'Предмет слишком высокий для ящика'
  const bounds = collisionBounds(item),
    margin = item.drawerIndex === undefined ? 0.01 : 0.025
  if (
    Math.abs(bounds.x) + bounds.w / 2 > surface.size[0] / 2 - margin + 1e-6 ||
    Math.abs(bounds.z) + bounds.d / 2 > surface.size[1] / 2 - margin + 1e-6
  )
    return 'Предмет выходит за край поверхности'
  if (
    surface.type === 'soft' &&
    floorClearance(item, parent!, items) < CONTACT_GAP - 1e-6
  )
    return 'Предмет пересекает спинку, подлокотник или выступ поверхности'
  for (const other of items) {
    if (
      other.id !== item.id &&
      isSmall(other) &&
      other.surfaceId === item.surfaceId &&
      other.drawerIndex === item.drawerIndex &&
      smallItemClearance(item, other, items) <
        (item.drawerIndex === undefined ? SMALL_GAP : 0.035) - 1e-6
    )
      return 'На поверхности уже есть другой предмет'
  }
  return null
}
export function footprint(item: Item): [number, number] {
  const [w, d] = catalog[item.kind].size
  const bounds = axisBounds({
    x: item.x,
    z: item.z,
    w,
    d,
    angle: (item.rotation * Math.PI) / 2,
    circle: catalog[item.kind].shape === 'circle',
  })
  return [bounds.w, bounds.d]
}
export const SMALL_GAP = 0.012
export const CONTACT_GAP = 0.003
type Bounds = ReturnType<typeof axisBounds> & { oriented: Planar }

function localBounds(
  item: Item,
  w: number,
  d: number,
  x = 0,
  z = 0,
  circle = false,
): Planar {
  const angle = (item.rotation * Math.PI) / 2
  return {
    x: item.x + Math.cos(angle) * x + Math.sin(angle) * z,
    z: item.z - Math.sin(angle) * x + Math.cos(angle) * z,
    w,
    d,
    angle,
    circle,
  }
}

// Cup cylinder: radius .09; handle: centre X=.085, outer radius .038.
// Preserve its asymmetric extent instead of inflating both sides of the origin.
export function collisionBounds(item: Item): Bounds {
  const [w, d] = catalog[item.kind].size
  const oriented =
    item.kind === 'cup'
      ? localBounds(item, 0.213, 0.18, 0.0165)
      : localBounds(item, w, d, 0, 0, catalog[item.kind].shape === 'circle')
  return { ...axisBounds(oriented), oriented }
}

function volumeClearance(
  a: Item & { y: number },
  av: CollisionVolume[],
  b: Item & { y: number },
  bv: CollisionVolume[],
) {
  let distance = Infinity
  for (const first of av)
    for (const second of bv) {
      const lowA = a.y + first.p[1] - first.s[1] / 2,
        highA = lowA + first.s[1]
      const lowB = b.y + second.p[1] - second.s[1] / 2,
        highB = lowB + second.s[1]
      if (highA <= lowB + 1e-6 || highB <= lowA + 1e-6) continue
      distance = Math.min(
        distance,
        planarDistance(
          localBounds(
            a,
            first.s[0],
            first.s[2],
            first.p[0],
            first.p[2],
            first.circle,
          ),
          localBounds(
            b,
            second.s[0],
            second.s[2],
            second.p[0],
            second.p[2],
            second.circle,
          ),
        ),
      )
    }
  return distance
}
export function smallItemClearance(a: Item, b: Item, items: Item[]): number {
  return volumeClearance(
    worldPose(a, items),
    smallVolumes(a),
    worldPose(b, items),
    smallVolumes(b),
  )
}
export function floorClearance(
  small: Item,
  other: Item,
  items: Item[] = [small, other],
): number {
  if (isSmall(other)) return smallItemClearance(small, other, items)
  return volumeClearance(
    worldPose(small, items),
    smallVolumes(small),
    { ...other, y: 0 },
    furnitureVolumes(other, supportHeight(other, items)),
  )
}
export const GRID_STEP = 0.25
// Flat capture zone with a C1-continuous release into free movement.
// No discontinuous switch at the edge of attraction or between grid cells.
export function snap(value: number) {
  const nearest = Math.round(value / GRID_STEP) * GRID_STEP
  const delta = value - nearest,
    distance = Math.abs(delta)
  const capture = 0.012,
    release = 0.03
  if (distance <= capture) return nearest
  if (distance >= release) return value
  const span = release - capture,
    t = (distance - capture) / span
  const eased =
    (3 * t * t - 2 * t * t * t) * release + (t * t * t - t * t) * span
  return nearest + Math.sign(delta) * eased
}
export function minimumGap(a: Item, b: Item): number {
  const ca = catalog[a.kind].category,
    cb = catalog[b.kind].category
  if (
    ca === 'floorDecor' ||
    cb === 'floorDecor' ||
    ca === 'surfaceDecor' ||
    cb === 'surfaceDecor'
  )
    return 0
  // Full visible footprints already include arms/backs. Keep a contact margin,
  // rather than the old 22 cm composition reserve invisible in the preview.
  if (ca === 'furniture' && cb === 'furniture') return 0.02
  return ca === 'decor' && cb === 'decor' ? 0.06 : 0.08
}
// Distance between oriented footprints at any angle.
// Circular decor uses its silhouette instead of an inflated square.
export function clearanceBetween(a: Item, b: Item): number {
  return planarDistance(
    collisionBounds(a).oriented,
    collisionBounds(b).oriented,
  )
}
export function placementCandidate(item: Item, x: number, z: number): Item {
  // Collisions only determine feedback / commit; they never move the preview.
  return { ...item, x: snap(x), z: snap(z) }
}
export function validatePlacement(item: Item, items: Item[]): string | null {
  const small = isSmall(item)
  if (small && item.surfaceId !== undefined)
    return validateSurfacePlacement(item, items)
  if (small && item.drawerIndex !== undefined)
    return 'Сначала выберите открытый ящик'
  const { x, z, w, d } = collisionBounds(item)
  const left = x - w / 2,
    right = x + w / 2,
    back = z - d / 2,
    front = z + d / 2
  const epsilon = 1e-6
  if (
    left < -4.88 - epsilon ||
    right > 4.88 + epsilon ||
    back < -3.38 - epsilon ||
    front > 3.38 + epsilon
  )
    return 'Предмет должен находиться внутри дома'
  if (!(right <= -0.12 + epsilon || left >= 0.12 - epsilon))
    return 'Предмет должен целиком помещаться в одной комнате'
  if (
    item.kind === 'bin' &&
    (item.binRoom === 'living' ? right > -0.12 : left < 0.12)
  )
    return 'Ведро должно оставаться в своей комнате'
  const floorDecor = catalog[item.kind].category === 'floorDecor'
  if (
    !floorDecor &&
    overlaps(collisionBounds(item).oriented, { x: 0, z: 1.55, w: 1, d: 1.5 })
  )
    return 'Оставьте свободным проход между комнатами'
  if (
    !floorDecor &&
    overlaps(collisionBounds(item).oriented, { x: 2.4, z: 3.7, w: 1.4, d: 1.4 })
  )
    return 'Оставьте свободным вход в дом'
  for (const other of items) {
    if (other.id === item.id) continue
    if (small || isSmall(other)) {
      if (catalog[other.kind].category === 'floorDecor' || floorDecor) continue
      // Attached decor belongs to another height/layer, not the room floor.
      if ((small && item.surfaceId) || (isSmall(other) && other.surfaceId))
        continue
      const distance = small
        ? floorClearance(item, other, items)
        : floorClearance(other, item, [
            ...items.filter((i) => i.id !== item.id),
            item,
          ])
      if (
        distance <
        (small && isSmall(other) ? SMALL_GAP : CONTACT_GAP) - epsilon
      )
        return 'Здесь уже стоит другой предмет'
      continue
    }
    const gap = minimumGap(item, other)
    if (gap === 0) continue
    const distance = clearanceBetween(item, other)
    if (distance < gap - epsilon)
      return distance <= 0
        ? 'Здесь уже стоит другой предмет'
        : `Нужен отступ ${Math.round(gap * 100)} см от «${catalog[other.kind].name}»`
  }
  return null
}
