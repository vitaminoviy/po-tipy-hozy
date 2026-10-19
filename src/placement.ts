export type Kind =
  'sofa' | 'table' | 'chair' | 'plant' | 'bed' | 'cabinet' | 'lamp'
export type Item = {
  id: string
  kind: Kind
  x: number
  z: number
  rotation: number
}
export const catalog: Record<
  Kind,
  { name: string; size: [number, number]; color: string; icon: string }
> = {
  sofa: { name: 'Диван «Мох»', size: [2.5, 1.1], color: '#778873', icon: '▰' },
  table: {
    name: 'Журнальный стол',
    size: [1.35, 0.85],
    color: '#c0956c',
    icon: '▱',
  },
  chair: { name: 'Мягкое кресло', size: [1, 1], color: '#bc855f', icon: '◧' },
  plant: {
    name: 'Комнатное растение',
    size: [0.65, 0.65],
    color: '#638567',
    icon: '♧',
  },
  bed: {
    name: 'Кровать «Облако»',
    size: [2, 2.65],
    color: '#e7d9bd',
    icon: '▤',
  },
  cabinet: {
    name: 'Дубовый комод',
    size: [1.5, 0.65],
    color: '#ae8056',
    icon: '▥',
  },
  lamp: { name: 'Торшер', size: [0.65, 0.65], color: '#e1cdaa', icon: '♙' },
}
export const initialItems: Item[] = [
  { id: 'sofa', kind: 'sofa', x: -2.8, z: -2.45, rotation: 0 },
  { id: 'table', kind: 'table', x: -2.8, z: -0.4, rotation: 0 },
  { id: 'chair', kind: 'chair', x: -4, z: 1.6, rotation: 1 },
  { id: 'plant', kind: 'plant', x: -0.8, z: -2.7, rotation: 0 },
  { id: 'bed', kind: 'bed', x: 2.8, z: -1.65, rotation: 0 },
  { id: 'cabinet', kind: 'cabinet', x: 4, z: 2.65, rotation: 0 },
  { id: 'lamp', kind: 'lamp', x: 4.25, z: -2.7, rotation: 0 },
]
export function footprint(item: Item): [number, number] {
  const [w, d] = catalog[item.kind].size
  return item.rotation % 2 ? [d, w] : [w, d]
}
export const snap = (value: number) => Math.round(value * 4) / 4
export function validatePlacement(item: Item, items: Item[]): string | null {
  const [w, d] = footprint(item)
  const left = item.x - w / 2,
    right = item.x + w / 2,
    back = item.z - d / 2,
    front = item.z + d / 2
  if (left < -4.85 || right > 4.85 || back < -3.35 || front > 3.35)
    return 'Предмет должен находиться внутри дома'
  if (!(right <= -0.23 || left >= 0.23))
    return 'Предмет должен целиком помещаться в одной комнате'
  if (left < 0.85 && right > -0.85 && front > 0.65 && back < 2.35)
    return 'Оставьте свободным проход между комнатами'
  if (right > 1.7 && left < 3.1 && front > 2.85)
    return 'Оставьте свободным вход в дом'
  for (const other of items) {
    if (other.id === item.id) continue
    const [ow, od] = footprint(other)
    if (
      Math.abs(item.x - other.x) < (w + ow) / 2 + 0.04 &&
      Math.abs(item.z - other.z) < (d + od) / 2 + 0.04
    )
      return 'Здесь уже стоит другой предмет'
  }
  return null
}
