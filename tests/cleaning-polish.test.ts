import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  availableBins,
  nearestBin,
  initialTrash,
  DISPOSAL_MS,
  cleaningProgress,
  disposalFrame,
} from '../src/cleaning'
import { initialItems, validatePlacement, type Item } from '../src/placement'
import { createHistory, historyReducer } from '../src/history'
import { floorSupport } from '../src/grounding'

test('both bins are normal floor items, stay in their own room and reject real collisions', () => {
  const bins = initialItems.filter((i) => i.kind === 'bin')
  assert.equal(bins.length, 2)
  for (const bin of bins) {
    assert.equal(validatePlacement(bin, initialItems), null)
    const x = bin.binRoom === 'living' ? -1 : 1
    const moved = { ...bin, x, z: 0, rotation: 1 }
    assert.equal(validatePlacement(moved, initialItems), null)
    assert.match(
      validatePlacement({ ...moved, x: -x }, initialItems)!,
      /своей комнате/,
    )
    const obstacle = initialItems.find(
      (i) => i.kind === (bin.binRoom === 'living' ? 'table' : 'bed'),
    )!
    assert.ok(
      validatePlacement({ ...bin, x: obstacle.x, z: obstacle.z }, initialItems),
    )
    assert.ok(validatePlacement({ ...bin, x: 4.9 }, initialItems))
    assert.equal(floorSupport({ ...bin, w: 0.472, d: 0.472 }, []), 0.015)
  }
})
test('nearest available bin uses current coordinates, original room and a busy-bin exclusion', () => {
  const trash = initialTrash[0]
  const original = initialItems.find((i) => i.id === 'bin-living')!
  const moved = { ...original, x: -2, z: -1 }
  const extra: Item = { ...original, id: 'another-bin', x: -4, z: -1 }
  const items = [
    ...initialItems.filter((i) => i.id !== original.id),
    moved,
    extra,
  ]
  assert.equal(nearestBin(trash, items)?.id, extra.id)
  assert.equal(nearestBin(trash, items, extra.id)?.x, moved.x)
  assert.equal(
    nearestBin(
      trash,
      items.filter((i) => i.binRoom !== 'living'),
    ),
    undefined,
  )
  assert.equal(nearestBin(trash, []), undefined)
  assert.equal(availableBins(items).length, 3)
  const floorCup: Item = {
    id: 'floor-probe',
    kind: 'cup',
    x: original.x,
    z: original.z,
    rotation: 0,
  }
  assert.ok(validatePlacement(floorCup, initialItems))
  assert.equal(
    validatePlacement(
      floorCup,
      initialItems.map((i) => (i.id === moved.id ? moved : i)),
    ),
    null,
  )
})
test('in-flight state is transient, rejects duplicate starts and records exactly one completed disposal', () => {
  const start = createHistory()
  let state = historyReducer(start, { type: 'trash-start', id: 'trash-l1' })
  assert.equal(state.trash[0].state, 'disposing')
  assert.equal(state.past.length, 0)
  assert.equal(cleaningProgress(state.trash, 'living').disposed, 0)
  assert.equal(
    historyReducer(state, { type: 'trash-start', id: 'trash-l1' }),
    state,
  )
  assert.equal(
    historyReducer(state, { type: 'trash-start', id: 'trash-l2' }),
    state,
  )
  const cancelled = historyReducer(state, { type: 'trash-cancel' })
  assert.deepEqual(cancelled.trash, start.trash)
  state = historyReducer(state, {
    type: 'trash-dispose',
    id: 'trash-l1',
    binId: 'bin-living',
  })
  assert.equal(state.past.length, 1)
  assert.equal(cleaningProgress(state.trash, 'living').disposed, 1)
  const restored = historyReducer(state, { type: 'undo' })
  assert.deepEqual(restored.trash, start.trash)
  assert.equal(
    historyReducer(restored, { type: 'redo' }).trash[0].state,
    'disposed',
  )
})
test('moving a bin, cleaning into it and undo/redo share one chronological history', () => {
  let state = createHistory()
  const bin = state.present.find((i) => i.id === 'bin-living')!
  const moved = { ...bin, x: -1, z: 0, rotation: 1 }
  state = historyReducer(state, { type: 'change', item: moved })
  state = historyReducer(state, { type: 'trash-start', id: 'trash-l1' })
  state = historyReducer(state, {
    type: 'trash-dispose',
    id: 'trash-l1',
    binId: bin.id,
  })
  assert.equal(state.past.length, 2)
  state = historyReducer(state, { type: 'undo' })
  assert.deepEqual(
    state.present.find((i) => i.id === bin.id),
    moved,
  )
  assert.equal(state.trash[0].state, 'room')
  state = historyReducer(state, { type: 'undo' })
  assert.deepEqual(
    state.present.find((i) => i.id === bin.id),
    bin,
  )
  state = historyReducer(state, { type: 'redo' })
  assert.equal(state.present.find((i) => i.id === bin.id)?.x, moved.x)
})
test('720 ms trajectory reaches a relocated bin with a finite bounded arc and no mid-flight shrinking', () => {
  assert.ok(DISPOSAL_MS >= 600 && DISPOSAL_MS <= 800)
  const from = { x: -4.45, y: 0.015, z: -1.3 },
    to = { x: -1, y: 0.195, z: 0 }
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.85]) {
    const pose = disposalFrame(from, to, t)
    assert.equal(pose.scale, 1)
    assert.ok(pose.y > from.y)
    assert.ok(Number.isFinite(pose.x + pose.y + pose.z))
  }
  assert.deepEqual(disposalFrame(from, to, 0), { ...from, scale: 1 })
  const end = disposalFrame(from, to, 1)
  assert.equal(end.x, to.x)
  assert.equal(end.y, to.y)
  assert.equal(end.z, to.z)
  const vertical = disposalFrame(from, { ...from, y: 0.2 }, 0.5)
  assert.ok(Number.isFinite(vertical.y))
})
