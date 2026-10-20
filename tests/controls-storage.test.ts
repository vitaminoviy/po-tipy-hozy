import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  movement,
  smoothAxis,
  CAMERA_SPEED,
  primaryInteraction,
} from '../src/controls'
import {
  drawerSpecs,
  initialItems,
  validatePlacement,
  worldPose,
  DRAWER_TRAVEL,
  type Item,
} from '../src/placement'
import { createHistory, historyReducer } from '../src/history'

const cabinet = {
  ...initialItems.find((i) => i.id === 'cabinet')!,
  drawers: [true, true, true] as [boolean, boolean, boolean],
}
const stand = {
  ...initialItems.find((i) => i.id === 'nightstand')!,
  drawers: [true, false, false] as [boolean, boolean, boolean],
}
const stored = (
  kind: 'book' | 'cup' | 'box',
  parent = cabinet,
  index = 0,
): Item => ({
  id: kind,
  kind,
  surfaceId: parent.id,
  drawerIndex: index,
  x: 0,
  z: 0,
  rotation: 0,
})

test('WASD follows camera yaw, diagonals normalize and opposing keys cancel', () => {
  assert.deepEqual(movement(new Set(['KeyW']), { x: 0, z: -1 }), {
    x: 0,
    z: -1,
  })
  assert.deepEqual(movement(new Set(['KeyD']), { x: 1, z: 0 }), { x: 0, z: 1 })
  const d = movement(new Set(['KeyW', 'KeyD']), { x: -0.6, z: -0.8 })
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 1e-10)
  const zero = movement(new Set(['KeyW', 'KeyS', 'KeyD', 'KeyA']), {
    x: 0,
    z: -1,
  })
  assert.equal(Math.hypot(zero.x, zero.z), 0)
})
test('camera acceleration and braking integrate equally at 30, 60 and 144 FPS', () => {
  const simulate = (fps: number) => {
    let velocity = 0,
      distance = 0
    for (let frame = 0; frame < fps * 2; frame++) {
      const next = smoothAxis(velocity, frame < fps ? CAMERA_SPEED : 0, 1 / fps)
      velocity = next.velocity
      distance += next.distance
    }
    return distance
  }
  assert.ok(Math.abs(simulate(30) - simulate(144)) < 1e-10)
  assert.ok(Math.abs(simulate(60) - simulate(144)) < 1e-10)
})

test('E selects existing actions without camera movement or a new mechanic', () => {
  assert.equal(primaryInteraction(), null)
  assert.equal(primaryInteraction(initialItems[0]), null)
  assert.deepEqual(
    primaryInteraction(initialItems.find((i) => i.kind === 'lamp')),
    { kind: 'lamp' },
  )
  assert.deepEqual(primaryInteraction(stored('book')), { kind: 'take' })
  assert.deepEqual(
    primaryInteraction({ ...cabinet, drawers: [false, false, false] }),
    { kind: 'drawer', index: 0 },
  )
  assert.deepEqual(
    primaryInteraction({ ...cabinet, drawers: [false, true, false] }),
    { kind: 'drawer', index: 1 },
  )
  assert.deepEqual(primaryInteraction(stand), { kind: 'drawer', index: 0 })
})
test('nightstand has one real drawer; book and cup fit, box is rejected by height', () => {
  assert.equal(drawerSpecs(stand).length, 1)
  assert.equal(drawerSpecs(cabinet).length, 3)
  for (const kind of ['book', 'cup'] as const)
    assert.equal(validatePlacement(stored(kind, stand), [stand]), null)
  assert.match(validatePlacement(stored('box', stand), [stand])!, /высокий/)
  assert.ok(validatePlacement({ ...stored('book', stand), x: 0.15 }, [stand]))
  assert.ok(validatePlacement({ ...stored('book', stand), z: 0.15 }, [stand]))
  assert.match(
    validatePlacement(stored('book', stand), [
      { ...stand, drawers: [false, false, false] },
    ])!,
    /откройте/,
  )
})
test('storage collisions apply only within the same drawer, not the tabletop or adjacent drawer', () => {
  const book = stored('book'),
    cup = { ...stored('cup'), x: 0.43 },
    box = { ...stored('box'), x: -0.43 }
  const items = [cabinet, book, cup, box]
  for (const i of [book, cup, box])
    assert.equal(validatePlacement(i, items), null)
  assert.match(validatePlacement({ ...cup, x: 0 }, items)!, /другой/)
  assert.equal(validatePlacement({ ...cup, x: 0, drawerIndex: 1 }, items), null)
  assert.equal(
    validatePlacement({ ...cup, x: 0, drawerIndex: undefined }, items),
    null,
  )
  assert.ok(validatePlacement({ ...book, z: 0.2 }, items))
})
test('stored contents follow drawer translation and all host rotations in local coordinates', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const parent = { ...cabinet, rotation },
      book = { ...stored('book'), x: 0.2, z: 0.04 }
    const open = worldPose(book, [parent]),
      closed = worldPose(book, [{ ...parent, drawers: [false, false, false] }])
    assert.ok(
      Math.abs(
        Math.hypot(open.x - closed.x, open.z - closed.z) - DRAWER_TRAVEL,
      ) < 1e-8,
    )
    const moved = worldPose(book, [
      { ...parent, x: parent.x + 1, z: parent.z - 2 },
    ])
    assert.ok(Math.abs(moved.x - open.x - 1) < 1e-8)
    assert.ok(Math.abs(moved.z - open.z + 2) < 1e-8)
    assert.equal(open.y, 0.216)
  }
})
test('one completed mouse placement creates one command; new stand drawer actions support history', () => {
  let history = createHistory([stand])
  const preview = { ...stand, z: stand.z + 0.3 }
  assert.equal(history.past.length, 0)
  history = historyReducer(history, {
    type: 'change',
    item: { ...preview, rotation: 1 },
  })
  assert.equal(history.past.length, 1)
  assert.deepEqual(history.present[0].drawers, [false, false, false])
  history = historyReducer(history, { type: 'undo' })
  assert.deepEqual(history.present[0], stand)
  history = historyReducer(history, { type: 'drawer', id: stand.id, index: 0 })
  assert.equal(history.present[0].drawers?.[0], false)
  assert.equal(history.future.length, 0)
  assert.equal(
    historyReducer(history, { type: 'drawer', id: stand.id, index: 1 }),
    history,
  )
})
test('store, close, move, reopen, extract and undo/redo preserve identity and local position', () => {
  const book = initialItems.find((i) => i.id === 'book')!
  let history = createHistory([cabinet, book])
  history = historyReducer(history, {
    type: 'change',
    item: { ...stored('book'), x: 0.2 },
  })
  history = historyReducer(history, {
    type: 'drawer',
    id: cabinet.id,
    index: 0,
  })
  history = historyReducer(history, {
    type: 'change',
    item: { ...history.present[0], x: 3.75, z: 2.4, rotation: 1 },
  })
  history = historyReducer(history, {
    type: 'drawer',
    id: cabinet.id,
    index: 0,
  })
  const inDrawer = history.present
  history = historyReducer(history, { type: 'change', item: book })
  assert.equal(history.present[1].drawerIndex, undefined)
  history = historyReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, inDrawer)
  for (let i = 0; i < 12; i++) {
    history = historyReducer(history, { type: 'redo' })
    history = historyReducer(history, { type: 'undo' })
    assert.equal(new Set(history.present.map((i) => i.id)).size, 2)
    assert.deepEqual(history.present[1], { ...stored('book'), x: 0.2 })
  }
})
