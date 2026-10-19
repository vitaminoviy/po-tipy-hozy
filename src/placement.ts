export type Kind =
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
  rotation: number
  surfaceId?: string
  drawerIndex?: number
  drawers?: [boolean, boolean, boolean]
  lampOn?: boolean
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
]
export const isSmall = (item: Item) =>
  catalog[item.kind].category === 'surfaceDecor'
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
    const top = catalog[parent.kind].surface
    return top && { ...top, center: 0, open: true, clearance: Infinity }
  }
  const drawer = drawerSpecs(parent)[item.drawerIndex]
  return (
    drawer && {
      height: drawer.y - 0.09,
      size: drawer.inner,
      center:
        drawer.center +
        (parent.drawers?.[item.drawerIndex] ? DRAWER_TRAVEL : 0),
      open: !!parent.drawers?.[item.drawerIndex],
      clearance: drawer.height,
    }
  )
}
export function worldPose(item: Item, items: Item[]): WorldItem {
  const parent = items.find((i) => i.id === item.surfaceId),
    surface = parent && support(item, parent)
  if (!surface || !parent) return { ...item, y: isSmall(item) ? 0.035 : 0 }
  const angle = (parent.rotation * Math.PI) / 2,
    c = Math.cos(angle),
    s = Math.sin(angle)
  return {
    ...item,
    x: parent.x + c * item.x + s * (item.z + surface.center),
    z: parent.z - s * item.x + c * (item.z + surface.center),
    y: surface.height + 0.006,
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
  if (!surface) return 'Нужна поверхность стола, тумбы или комода'
  if (!surface.open) return 'Сначала откройте ящик'
  if (catalog[item.kind].height + 0.006 > surface.clearance)
    return 'Предмет слишком высокий для ящика'
  const [w, d] = footprint(item),
    margin = 0.025
  if (
    Math.abs(item.x) + w / 2 > surface.size[0] / 2 - margin + 1e-6 ||
    Math.abs(item.z) + d / 2 > surface.size[1] / 2 - margin + 1e-6
  )
    return 'Предмет выходит за край поверхности'
  for (const other of items) {
    if (
      other.id !== item.id &&
      isSmall(other) &&
      other.surfaceId === item.surfaceId &&
      other.drawerIndex === item.drawerIndex &&
      clearanceBetween(item, other) < 0.035 - 1e-6
    )
      return 'На поверхности уже есть другой предмет'
  }
  return null
}
export function footprint(item: Item): [number, number] {
  const [w, d] = catalog[item.kind].size
  return item.rotation % 2 ? [d, w] : [w, d]
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
  if (ca === 'furniture' && cb === 'furniture') return 0.22
  return ca === 'decor' && cb === 'decor' ? 0.06 : 0.08
}
// Distance between the actual axis-aligned footprints (quarter-turn rotations).
// Circular decor uses its silhouette instead of an inflated square.
export function clearanceBetween(a: Item, b: Item): number {
  const [aw, ad] = footprint(a),
    [bw, bd] = footprint(b)
  const ac = catalog[a.kind].shape === 'circle',
    bc = catalog[b.kind].shape === 'circle'
  const dx = Math.abs(a.x - b.x),
    dz = Math.abs(a.z - b.z)
  if (ac && bc) return Math.hypot(dx, dz) - (aw + bw) / 2
  if (ac || bc) {
    const circle = ac ? a : b,
      box = ac ? b : a
    const [w, d] = footprint(box),
      radius = footprint(circle)[0] / 2
    return Math.hypot(Math.max(0, dx - w / 2), Math.max(0, dz - d / 2)) - radius
  }
  return Math.hypot(
    Math.max(0, dx - (aw + bw) / 2),
    Math.max(0, dz - (ad + bd) / 2),
  )
}
export function placementCandidate(item: Item, x: number, z: number): Item {
  // Collisions only determine feedback / commit; they never move the preview.
  return { ...item, x: snap(x), z: snap(z) }
}
export function validatePlacement(item: Item, items: Item[]): string | null {
  if (isSmall(item)) return validateSurfacePlacement(item, items)
  const [w, d] = footprint(item)
  const left = item.x - w / 2,
    right = item.x + w / 2,
    back = item.z - d / 2,
    front = item.z + d / 2
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
  const floorDecor = catalog[item.kind].category === 'floorDecor'
  if (!floorDecor && left < 0.5 && right > -0.5 && front > 0.8 && back < 2.3)
    return 'Оставьте свободным проход между комнатами'
  if (!floorDecor && right > 1.7 && left < 3.1 && front > 3.0)
    return 'Оставьте свободным вход в дом'
  for (const other of items) {
    if (other.id === item.id) continue
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
