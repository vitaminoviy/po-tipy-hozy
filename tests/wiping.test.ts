import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRUSH_RADIUS,
  MASK_SIZE,
  cleanFraction,
  createDirt,
  dirtPatches,
  initialMask,
  isClean,
  wipeSegment,
} from '../src/wiping'
import { createHistory, historyReducer } from '../src/history'

const patch = dirtPatches[0]
const stroke = (mask: Uint8Array, z = 0) =>
  wipeSegment(mask, patch, { x: -0.4, z }, { x: 0.4, z })
test('two independent deterministic irregular masks start dirty', () => {
  const a = createDirt(),
    b = createDirt()
  assert.equal(a.length, 2)
  assert.deepEqual(a, b)
  assert.notEqual(a[0].mask, a[1].mask)
  assert.equal(cleanFraction(a[0].mask), 0)
  assert.equal(isClean(a[0].mask), false)
  assert.ok(new Set(a[0].mask).size > 100)
})
test('one stroke cleans only its swept area and preserves dirt outside', () => {
  const before = initialMask(),
    after = before.slice()
  assert.ok(stroke(after))
  assert.ok(cleanFraction(after) > 0.1 && cleanFraction(after) < 0.65)
  let untouched = 0
  after.forEach((v, i) => {
    const z = ((Math.floor(i / MASK_SIZE) + 0.5) / MASK_SIZE - 0.5) * patch.d
    if (Math.abs(z) > BRUSH_RADIUS) {
      assert.equal(v, before[i])
      untouched++
    }
  })
  assert.ok(untouched > MASK_SIZE ** 2 / 2)
})
test('stationary holds and clicks do not erase dirt', () => {
  const mask = initialMask()
  assert.equal(wipeSegment(mask, patch, { x: 0, z: 0 }, { x: 0, z: 0 }), false)
  assert.equal(cleanFraction(mask), 0)
})
test('repeated clean core earns no further progress', () => {
  const mask = initialMask()
  for (let n = 0; n < 255; n++) stroke(mask)
  const before = mask.slice(),
    progress = cleanFraction(mask)
  assert.equal(stroke(mask), false)
  assert.deepEqual(mask, before)
  assert.equal(cleanFraction(mask), progress)
})
test('fast horizontal, diagonal and reverse strokes have no gaps or direction bias', () => {
  for (const end of [
    { x: 0.4, z: 0 },
    { x: 0, z: 0.28 },
    { x: 0.4, z: 0.25 },
    { x: -0.4, z: 0.25 },
  ]) {
    const from = { x: -end.x, z: -end.z },
      a = initialMask(),
      b = a.slice()
    wipeSegment(a, patch, from, end)
    wipeSegment(b, patch, end, from)
    assert.deepEqual(a, b)
    for (let step = 1; step < 9; step++) {
      const x = from.x + ((end.x - from.x) * step) / 10,
        z = from.z + ((end.z - from.z) * step) / 10,
        i =
          Math.floor((z / patch.d + 0.5) * MASK_SIZE) * MASK_SIZE +
          Math.floor((x / patch.w + 0.5) * MASK_SIZE)
      assert.equal(a[i], 0)
    }
  }
})
test('percentage comes from remaining alpha and completion threshold is attainable', () => {
  const original = initialMask(),
    half = original.map((v) => Math.round(v / 2))
  assert.ok(Math.abs(cleanFraction(half) - 0.5) < 0.01)
  assert.equal(isClean(half), false)
  for (let z = -patch.d / 2; z <= patch.d / 2; z += 0.06) stroke(original, z)
  assert.ok(isClean(original))
  assert.equal(cleanFraction(new Uint8Array(MASK_SIZE ** 2)), 1)
})
test('one completed gesture is one history action with immutable undo/redo masks', () => {
  const initial = createHistory(),
    mask = initial.dirt[0].mask.slice()
  stroke(mask)
  stroke(mask, 0.15)
  const changed = historyReducer(initial, { type: 'wipe', id: patch.id, mask })
  mask.fill(0)
  assert.equal(changed.past.length, 1)
  assert.ok(cleanFraction(changed.dirt[0].mask) < 1)
  assert.equal(cleanFraction(initial.dirt[0].mask), 0)
  const undo = historyReducer(changed, { type: 'undo' })
  assert.deepEqual(undo.dirt, initial.dirt)
  assert.deepEqual(historyReducer(undo, { type: 'redo' }).dirt, changed.dirt)
})
test('cancelled private gesture does not mutate session, history or other room', () => {
  const state = createHistory(),
    copy = state.dirt[0].mask.slice()
  stroke(copy)
  assert.equal(state.past.length, 0)
  assert.equal(cleanFraction(state.dirt[0].mask), 0)
  assert.equal(cleanFraction(state.dirt[1].mask), 0)
})
test('dirt survives furniture, lamp, trash and undo/redo actions independently', () => {
  let state = createHistory()
  const mask = state.dirt[0].mask.slice()
  stroke(mask)
  state = historyReducer(state, { type: 'wipe', id: patch.id, mask })
  const dirt = state.dirt
  state = historyReducer(state, { type: 'lamp', id: 'lamp' })
  state = historyReducer(state, { type: 'trash-select', id: state.trash[0].id })
  assert.equal(state.dirt, dirt)
  state = historyReducer(state, {
    type: 'trash-dispose',
    id: state.trash[0].id,
    binId: 'bin-living',
  })
  state = historyReducer(state, { type: 'undo' })
  assert.deepEqual(state.dirt, dirt)
  assert.equal(cleanFraction(state.dirt[1].mask), 0)
})
test('no-op or repeated completed mask adds no history; a new stroke clears redo', () => {
  let state = createHistory()
  assert.equal(
    historyReducer(state, {
      type: 'wipe',
      id: patch.id,
      mask: state.dirt[0].mask,
    }),
    state,
  )
  state = historyReducer(state, {
    type: 'wipe',
    id: patch.id,
    mask: new Uint8Array(MASK_SIZE ** 2),
  })
  assert.equal(
    historyReducer(state, {
      type: 'wipe',
      id: patch.id,
      mask: state.dirt[0].mask,
    }),
    state,
  )
  state = historyReducer(state, { type: 'undo' })
  const mask = state.dirt[0].mask.slice()
  stroke(mask)
  state = historyReducer(state, { type: 'wipe', id: patch.id, mask })
  assert.equal(state.future.length, 0)
})
