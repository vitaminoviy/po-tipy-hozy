import { validatePlacement, type Item } from './placement'

export type PlacementSession = { origin: Item; lastValid: Item | null }

export function rememberPlacement(
  session: PlacementSession,
  candidate: Item,
  items: Item[],
): PlacementSession {
  return validatePlacement(candidate, items)
    ? session
    : { ...session, lastValid: { ...candidate } }
}

// Revalidate the snapshot: moving a host/closing a drawer must never commit an
// obsolete location. No history entry is made until the gesture ends.
export function resolveDrop(
  session: PlacementSession,
  candidate: Item,
  items: Item[],
): Item | null {
  for (const option of [candidate, session.lastValid, session.origin])
    if (option && !validatePlacement(option, items)) return { ...option }
  return null
}
