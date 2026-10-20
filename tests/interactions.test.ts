import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialItems,
  worldPose,
  surfaceLocal,
  validatePlacement,
  catalog,
  type Item,
} from '../src/placement'
import {
  createHistory,
  historyReducer,
  approach,
  DRAWER_TRAVEL,
} from '../src/history'

test('small decor supports the floor or an eligible surface and stays within its bounds', () => {
  const book = initialItems.find((i) => i.kind === 'book')!
  for (const id of ['table', 'cabinet', 'nightstand']) {
    assert.equal(
      validatePlacement(
        { ...book, surfaceId: id, x: 0, z: 0 },
        initialItems.filter((i) => i.id !== book.id && i.kind !== 'box'),
      ),
      null,
    )
    assert.match(
      validatePlacement({ ...book, surfaceId: id, x: 1, z: 0 }, initialItems)!,
      /край/,
    )
  }
  assert.equal(
    validatePlacement(
      { ...book, surfaceId: undefined, x: -1.5, z: 0 },
      initialItems,
    ),
    null,
  )
  assert.match(
    validatePlacement({ ...book, surfaceId: 'bed' }, initialItems)!,
    /поверхность/,
  )
})
test('surface decor collisions are local to the same support', () => {
  const book = initialItems.find((i) => i.kind === 'book')!,
    cup = initialItems.find((i) => i.kind === 'cup')!
  assert.ok(validatePlacement({ ...cup, x: book.x, z: book.z }, initialItems))
  assert.equal(
    validatePlacement(
      { ...cup, surfaceId: 'nightstand', x: 0, z: 0 },
      initialItems,
    ),
    null,
  )
  assert.equal(
    validatePlacement(
      initialItems.find((i) => i.id === 'table')!,
      initialItems,
    ),
    null,
  )
})
test('attachments follow all quarter turns and world/local transforms are reversible', () => {
  const book = initialItems.find((i) => i.kind === 'book')!,
    table = initialItems.find((i) => i.id === 'table')!
  for (let rotation = 0; rotation < 4; rotation++) {
    const parent = { ...table, x: 1, z: 2, rotation },
      items = [parent, book],
      pose = worldPose(book, items)
    const local = surfaceLocal(parent, pose.x, pose.z)
    assert.ok(Math.abs(local.x - book.x) < 1e-10)
    assert.ok(Math.abs(local.z - book.z) < 1e-10)
    assert.equal(pose.rotation, (rotation + book.rotation) % 4)
    assert.equal(pose.y, catalog.table.surface!.height + 0.006)
  }
})
test('each drawer is independent and history restores every state', () => {
  const original = createHistory()
  const a = historyReducer(original, {
    type: 'drawer',
    id: 'cabinet',
    index: 0,
  })
  const b = historyReducer(a, { type: 'drawer', id: 'cabinet', index: 2 })
  assert.deepEqual(b.present.find((i) => i.id === 'cabinet')!.drawers, [
    true,
    false,
    true,
  ])
  assert.deepEqual(historyReducer(b, { type: 'undo' }).present, a.present)
  assert.deepEqual(
    historyReducer(historyReducer(b, { type: 'undo' }), { type: 'redo' })
      .present,
    b.present,
  )
  assert.equal(
    original.present.find((i) => i.id === 'cabinet')!.drawers,
    undefined,
  )
})
test('moving and rotating cabinet closes drawers in the same undoable command', () => {
  const opened = historyReducer(createHistory(), {
    type: 'drawer',
    id: 'cabinet',
    index: 1,
  })
  const cabinet = opened.present.find((i) => i.id === 'cabinet')!
  for (const pose of [{ x: 3.75 }, { rotation: 1 }]) {
    const moved = historyReducer(opened, {
      type: 'change',
      item: { ...cabinet, ...pose },
    })
    assert.deepEqual(moved.present.find((i) => i.id === 'cabinet')!.drawers, [
      false,
      false,
      false,
    ])
    assert.deepEqual(
      historyReducer(moved, { type: 'undo' }).present,
      opened.present,
    )
    assert.equal(
      moved.present.find((i) => i.kind === 'box')!.surfaceId,
      'cabinet',
    )
  }
})
test('opening toward a wall is rejected and creates no history entry', () => {
  const state = createHistory(
    initialItems.map((i) => (i.id === 'cabinet' ? { ...i, z: 2.95 } : i)),
  )
  assert.equal(
    historyReducer(state, { type: 'drawer', id: 'cabinet', index: 0 }),
    state,
  )
})
test('lamp, rotation and decor placement support undo/redo and clear redo on a new action', () => {
  const start = createHistory(),
    table = start.present.find((i) => i.id === 'table')!,
    book = start.present.find((i) => i.kind === 'book')!
  const light = historyReducer(start, { type: 'lamp', id: 'lamp' })
  const moved = historyReducer(light, {
    type: 'change',
    item: { ...table, rotation: 1, x: -2.5 },
  })
  const placed = historyReducer(moved, {
    type: 'change',
    item: { ...book, surfaceId: 'nightstand', x: 0, z: 0 },
  })
  assert.equal(
    historyReducer(placed, { type: 'undo' }).present.find(
      (i) => i.kind === 'book',
    )!.surfaceId,
    'table',
  )
  let current = placed
  for (let n = 0; n < 3; n++)
    current = historyReducer(current, { type: 'undo' })
  assert.deepEqual(current.present, start.present)
  for (let n = 0; n < 3; n++)
    current = historyReducer(current, { type: 'redo' })
  assert.deepEqual(current.present, placed.present)
  const undone = historyReducer(placed, { type: 'undo' }),
    branch = historyReducer(undone, { type: 'lamp', id: 'lamp' })
  assert.equal(branch.future.length, 0)
  assert.equal(historyReducer(branch, { type: 'redo' }), branch)
})
test('no-op actions do not pollute history and snapshots do not mutate', () => {
  const state = createHistory(),
    serialized = JSON.stringify(state)
  assert.equal(
    historyReducer(state, { type: 'change', item: { ...state.present[0] } }),
    state,
  )
  assert.equal(historyReducer(state, { type: 'undo' }), state)
  historyReducer(state, { type: 'lamp', id: 'lamp' })
  assert.equal(JSON.stringify(state), serialized)
})
test('animation is bounded and monotonic when opening, reversing and under a long frame', () => {
  let position = 0
  for (let n = 0; n < 120; n++) {
    const next = approach(position, DRAWER_TRAVEL, 1 / 60, 12)
    assert.ok(next >= position && next <= DRAWER_TRAVEL)
    position = next
  }
  assert.equal(position, DRAWER_TRAVEL)
  const reversed = approach(position, 0, 1 / 60, 12)
  assert.ok(reversed < position && reversed >= 0)
  assert.ok(approach(0, 1, 10, 7) < 0.4)
  assert.equal(approach(0.3, 1, 0), 0.3)
})
