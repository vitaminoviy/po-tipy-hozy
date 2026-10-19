import { initialItems, validatePlacement, type Item } from './placement'

export const DRAWER_TRAVEL = 0.28
export type Mode = 'move' | 'interact'
export type Interaction =
  { kind: 'drawer'; index: number } | { kind: 'lamp' } | { kind: 'take' }
export type History = { past: Item[][]; present: Item[]; future: Item[][] }
export type Action =
  | { type: 'change'; item: Item }
  | { type: 'drawer'; id: string; index: number }
  | { type: 'lamp'; id: string }
  | { type: 'undo' | 'redo' }
export function createHistory(items: Item[] = initialItems): History {
  return {
    past: [],
    present: items.map((i) => ({
      ...i,
      drawers: i.drawers ? [...i.drawers] : undefined,
    })),
    future: [],
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
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return {
      past: [...state.past, state.present].slice(-100),
      present: state.future[0],
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
      return next.kind === 'cabinet' && moved
        ? {
            ...next,
            drawers: [false, false, false] as [boolean, boolean, boolean],
          }
        : next
    }
    if (
      action.type === 'drawer' &&
      item.id === action.id &&
      item.kind === 'cabinet' &&
      action.index >= 0 &&
      action.index < 3
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
    past: [...state.past, state.present].slice(-100),
    present,
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
