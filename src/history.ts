import {
  initialItems,
  validatePlacement,
  drawerSpecs,
  type Item,
} from './placement'
import { createDirt, type DirtState } from './wiping'
import {
  createPaint,
  finishPaint,
  type PaintState,
  type PaintColor,
} from './painting'

import { DRAWER_TRAVEL } from './placement'
import {
  initialTrash,
  clearTrashSelection,
  selectTrash,
  disposeTrash,
  availableBins,
  type Trash,
} from './cleaning'
export { DRAWER_TRAVEL } from './placement'
export type Mode = 'move' | 'interact'
export type Interaction =
  { kind: 'drawer'; index: number } | { kind: 'lamp' } | { kind: 'take' }
type Snapshot = {
  items: Item[]
  trash: Trash[]
  dirt: DirtState[]
  paint: PaintState[]
}
export type History = {
  past: Snapshot[]
  present: Item[]
  trash: Trash[]
  dirt: DirtState[]
  paint: PaintState[]
  future: Snapshot[]
}
export type Action =
  | { type: 'paint'; id: string; color: PaintColor; mask: Uint8Array }
  | { type: 'wipe'; id: string; mask: Uint8Array }
  | { type: 'change'; item: Item }
  | { type: 'drawer'; id: string; index: number }
  | { type: 'lamp'; id: string }
  | { type: 'trash-select'; id: string }
  | { type: 'trash-start'; id: string }
  | { type: 'trash-cancel' }
  | { type: 'trash-dispose'; id: string; binId: string }
  | { type: 'undo' | 'redo' }
export function createHistory(
  items: Item[] = initialItems,
  trash: Trash[] = initialTrash,
): History {
  return {
    past: [],
    present: items.map((i) => ({
      ...i,
      drawers: i.drawers ? [...i.drawers] : undefined,
    })),
    future: [],
    trash: trash.map((t) => ({ ...t })),
    dirt: createDirt(),
    paint: createPaint(),
  }
}
export function drawerOpeningError(item: Item, items: Item[]): string | null {
  const angle = (item.rotation * Math.PI) / 2
  return validatePlacement(
    {
      ...item,
      x: item.x + Math.sin(angle) * DRAWER_TRAVEL,
      z: item.z + Math.cos(angle) * DRAWER_TRAVEL,
    },
    items,
  )
}
export function historyReducer(state: History, action: Action): History {
  const snapshot = (): Snapshot => ({
    items: state.present,
    trash: clearTrashSelection(state.trash),
    dirt: state.dirt,
    paint: state.paint,
  })
  if (action.type === 'paint') {
    const before = state.paint.find((w) => w.id === action.id)
    const next = before && finishPaint(before, action.color, action.mask)
    if (!next) return state
    return {
      ...state,
      paint: state.paint.map((w) => (w.id === next.id ? next : w)),
      past: [...state.past, snapshot()].slice(-100),
      future: [],
    }
  }
  if (action.type === 'wipe') {
    const before = state.dirt.find((d) => d.id === action.id)
    if (
      !before ||
      action.mask.length !== before.mask.length ||
      !before.mask.some((v, i) => v !== action.mask[i])
    )
      return state
    return {
      ...state,
      dirt: state.dirt.map((d) =>
        d.id === action.id ? { id: d.id, mask: action.mask.slice() } : d,
      ),
      past: [...state.past, snapshot()].slice(-100),
      future: [],
    }
  }
  if (action.type === 'trash-select')
    return { ...state, trash: selectTrash(state.trash, action.id) }
  if (action.type === 'trash-start') {
    if (
      state.trash.some((t) => t.state === 'disposing') ||
      !state.trash.some((t) => t.id === action.id && t.state !== 'disposed')
    )
      return state
    return {
      ...state,
      trash: clearTrashSelection(state.trash).map((t) =>
        t.id === action.id ? { ...t, state: 'disposing' } : t,
      ),
    }
  }
  if (action.type === 'trash-cancel')
    return { ...state, trash: clearTrashSelection(state.trash) }
  if (action.type === 'trash-dispose') {
    const trash = disposeTrash(
      state.trash,
      action.id,
      action.binId,
      availableBins(state.present),
    )
    if (trash === state.trash) return state
    return {
      ...state,
      trash,
      past: [...state.past, snapshot()].slice(-100),
      future: [],
    }
  }
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!.items,
      trash: state.past.at(-1)!.trash,
      dirt: state.past.at(-1)!.dirt,
      paint: state.past.at(-1)!.paint,
      future: [snapshot(), ...state.future],
    }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return {
      past: [...state.past, snapshot()].slice(-100),
      present: state.future[0].items,
      trash: state.future[0].trash,
      dirt: state.future[0].dirt,
      paint: state.future[0].paint,
      future: state.future.slice(1),
    }
  }
  const present = state.present.map((item) => {
    if (action.type === 'change' && item.id === action.item.id) {
      const next = action.item
      const moved =
        item.x !== next.x ||
        item.z !== next.z ||
        item.rotation !== next.rotation
      return drawerSpecs(next).length && moved
        ? {
            ...next,
            drawers: [false, false, false] as [boolean, boolean, boolean],
          }
        : next
    }
    if (
      action.type === 'drawer' &&
      item.id === action.id &&
      drawerSpecs(item).length > 0 &&
      action.index >= 0 &&
      action.index < drawerSpecs(item).length
    ) {
      const drawers: [boolean, boolean, boolean] = [
        ...(item.drawers ?? [false, false, false]),
      ]
      if (!drawers[action.index] && drawerOpeningError(item, state.present))
        return item
      drawers[action.index] = !drawers[action.index]
      return { ...item, drawers }
    }
    if (action.type === 'lamp' && item.id === action.id && item.kind === 'lamp')
      return { ...item, lampOn: !item.lampOn }
    return item
  })
  if (JSON.stringify(present) === JSON.stringify(state.present)) return state
  return {
    past: [...state.past, snapshot()].slice(-100),
    present,
    trash: clearTrashSelection(state.trash),
    dirt: state.dirt,
    paint: state.paint,
    future: [],
  }
}

// Exponential approach is bounded, monotonic, and independent of frame rate.
export function approach(
  value: number,
  target: number,
  delta: number,
  rate = 10,
): number {
  if (delta <= 0 || rate <= 0 || value === target) return value
  const next =
    target +
    (value - target) * Math.exp(-rate * Math.max(0, Math.min(delta, 0.05)))
  return Math.abs(next - target) < 0.0001 ? target : next
}
