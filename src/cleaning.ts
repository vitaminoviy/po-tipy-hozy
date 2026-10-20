import type { Item } from './placement'
export type Room = 'living' | 'bedroom'
export type TrashKind = 'paper' | 'carton' | 'wrapper' | 'can'
export type Trash = {
  id: string
  kind: TrashKind
  room: Room
  x: number
  z: number
  state: 'room' | 'selected' | 'disposing' | 'disposed'
}
export const trashTypes: Record<
  TrashKind,
  { name: string; size: [number, number, number] }
> = {
  paper: { name: 'Скомканная бумага', size: [0.22, 0.18, 0.22] },
  carton: { name: 'Пустая упаковка', size: [0.32, 0.16, 0.26] },
  wrapper: { name: 'Бумажная обёртка', size: [0.26, 0.025, 0.18] },
  can: { name: 'Пустая банка', size: [0.16, 0.22, 0.16] },
}
export const roomNames: Record<Room, string> = {
  living: 'Гостиная',
  bedroom: 'Спальня',
}
export const bins = [
  { id: 'bin-living', room: 'living' as Room, x: -4.45, z: 2.75 },
  { id: 'bin-bedroom', room: 'bedroom' as Room, x: 4.45, z: 0.6 },
]
export const initialTrash: Trash[] = [
  {
    id: 'trash-l1',
    kind: 'paper',
    room: 'living',
    x: -4.45,
    z: -1.3,
    state: 'room',
  },
  {
    id: 'trash-l2',
    kind: 'carton',
    room: 'living',
    x: -1.38,
    z: -1.35,
    state: 'room',
  },
  {
    id: 'trash-l3',
    kind: 'wrapper',
    room: 'living',
    x: -2.1,
    z: 2.65,
    state: 'room',
  },
  {
    id: 'trash-l4',
    kind: 'can',
    room: 'living',
    x: -0.65,
    z: -0.95,
    state: 'room',
  },
  {
    id: 'trash-l5',
    kind: 'paper',
    room: 'living',
    x: -3.6,
    z: 0.85,
    state: 'room',
  },
  {
    id: 'trash-b1',
    kind: 'paper',
    room: 'bedroom',
    x: 1.05,
    z: -0.6,
    state: 'room',
  },
  {
    id: 'trash-b2',
    kind: 'wrapper',
    room: 'bedroom',
    x: 3.6,
    z: 0.3,
    state: 'room',
  },
  {
    id: 'trash-b3',
    kind: 'can',
    room: 'bedroom',
    x: 1.15,
    z: 2.55,
    state: 'room',
  },
  {
    id: 'trash-b4',
    kind: 'carton',
    room: 'bedroom',
    x: 4.5,
    z: 1.7,
    state: 'room',
  },
]
// Selection is transient: undo restores an item on the floor, never a stale hand.
export const clearTrashSelection = (trash: Trash[]): Trash[] =>
  trash.map((t) =>
    t.state === 'selected' || t.state === 'disposing'
      ? { ...t, state: 'room' }
      : t,
  )
export function selectTrash(trash: Trash[], id: string): Trash[] {
  if (trash.some((t) => t.state === 'disposing')) return trash
  if (!trash.some((t) => t.id === id && t.state !== 'disposed')) return trash
  return trash.map((t) =>
    t.state === 'disposed'
      ? t
      : { ...t, state: t.id === id ? 'selected' : 'room' },
  )
}
export function disposeTrash(
  trash: Trash[],
  id: string,
  binId: string,
  available: typeof bins = bins,
): Trash[] {
  if (
    !available.some((b) => b.id === binId) ||
    !trash.some(
      (t) => t.id === id && (t.state === 'selected' || t.state === 'disposing'),
    )
  )
    return trash
  return trash.map((t) => (t.id === id ? { ...t, state: 'disposed' } : t))
}
export function cleaningProgress(trash: Trash[], room: Room) {
  const records = trash.filter((t) => t.room === room)
  return {
    total: records.length,
    disposed: records.filter((t) => t.state === 'disposed').length,
  }
}
export function availableBins(items: Item[]) {
  return items
    .filter((i) => i.kind === 'bin' && i.binRoom)
    .map((i) => ({ id: i.id, x: i.x, z: i.z, room: i.binRoom! }))
}
export function nearestBin(trash: Trash, items: Item[], busyId?: string) {
  return availableBins(items)
    .filter((b) => b.room === trash.room && b.id !== busyId)
    .sort(
      (a, b) =>
        Math.hypot(a.x - trash.x, a.z - trash.z) -
        Math.hypot(b.x - trash.x, b.z - trash.z),
    )[0]
}
export const DISPOSAL_MS = 720
export type FlightPoint = { x: number; y: number; z: number }
export type Disposal = {
  id: string
  binId: string
  from: FlightPoint
  to: FlightPoint
}
export function disposalFrame(
  from: FlightPoint,
  bin: FlightPoint,
  progress: number,
) {
  const t = Math.max(0, Math.min(1, progress)),
    ease = t * t * (3 - 2 * t)
  const dx = bin.x - from.x,
    dz = bin.z - from.z,
    length = Math.hypot(dx, dz)
  const arc = Math.min(1.7, 0.8 + length * 0.18)
  return {
    x: from.x + dx * ease,
    z: from.z + dz * ease,
    y: from.y + (bin.y - from.y) * ease + 4 * arc * ease * (1 - ease),
    scale: t < 0.88 ? 1 : 1 - ((t - 0.88) / 0.12) * 0.8,
  }
}
