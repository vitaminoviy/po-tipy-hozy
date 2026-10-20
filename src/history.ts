import {
  initialItems,
  validatePlacement,
  drawerSpecs,
  type Item,
} from './placement'

import { DRAWER_TRAVEL } from './placement'
import {
  initialTrash,
  clearTrashSelection,
  selectTrash,
  disposeTrash,
  type Trash,
} from './cleaning'
export { DRAWER_TRAVEL } from './placement'
export type Mode = 'move' | 'interact'
export type Interaction =
  { kind: 'drawer'; index: number } | { kind: 'lamp' } | { kind: 'take' }
type Snapshot = { items: Item[]; trash: Trash[] }
export type History = {
  past: Snapshot[]
  present: Item[]
  trash: Trash[]
  future: Snapshot[]
}
export type Action =
  | { type: 'change'; item: Item }
  | { type: 'drawer'; id: string; index: number }
  | { type: 'lamp'; id: string }
  | { type: 'trash-select'; id: string }
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
  })
  if (action.type === 'trash-select')
    return { ...state, trash: selectTrash(state.trash, action.id) }
  if (action.type === 'trash-cancel')
    return { ...state, trash: clearTrashSelection(state.trash) }
  if (action.type === 'trash-dispose') {
    const trash = disposeTrash(state.trash, action.id, action.binId)
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
      future: [snapshot(), ...state.future],
    }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return {
      past: [...state.past, snapshot()].slice(-100),
      present: state.future[0].items,
      trash: state.future[0].trash,
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
