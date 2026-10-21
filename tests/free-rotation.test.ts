import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceRotation,
  beginRotation,
  releaseRotation,
  normalizeRotation,
  TAP_SECONDS,
} from '../src/rotation'
import { axisBounds, overlaps, planarDistance } from '../src/planarGeometry'
import {
  catalog,
  initialItems,
  validatePlacement,
  clearanceBetween,
  collisionBounds,
  worldPose,
  surfaceLocal,
  type Item,
} from '../src/placement'
import { FLOOR_TOP, floorSupport } from '../src/grounding'
import { createHistory, historyReducer } from '../src/history'
import { rememberPlacement, resolveDrop } from '../src/placementSession'

const degrees = (v: number) => v * 90
for (const direction of [-1, 1])
  test(`tap ${direction}: smooth 7.5 degrees, no immediate jump, bounded final transition`, () => {
    let m = beginRotation(0, direction, false)
    assert.equal(m.angle, 0)
    m = advanceRotation(m, 0.07)
    assert.ok(Math.abs(degrees(m.angle) - direction * 3.75) < 1e-8)
    m = advanceRotation(m, 0.07)
    assert.ok(Math.abs(degrees(m.angle) - direction * 7.5) < 1e-8)
    assert.equal(advanceRotation(m, 1).angle, m.angle)
  })
test('held turn is frame-rate independent at 30/60/144 FPS and stops without inertia', () => {
  for (const sign of [-1, 1]) {
    const values = [30, 60, 144].map((fps) => {
      let m = beginRotation(0, sign)
      for (let n = 0; n < fps * 2; n++) m = advanceRotation(m, 1 / fps)
      assert.equal(releaseRotation(m), null)
      return degrees(m.angle)
    })
    assert.ok(Math.max(...values) - Math.min(...values) < 1e-8)
    assert.ok(
      Math.abs(values[0] - sign * (7.5 + (2 - TAP_SECONDS) * 75)) < 1e-8,
    )
  }
})
test('direction reversal starts from current angle, arbitrary 32/67 degrees and wrap stay continuous', () => {
  const initial = advanceRotation(beginRotation(0, 1), 0.5)
  const reversed = beginRotation(initial.angle, -1)
  assert.equal(reversed.angle, initial.angle)
  assert.ok(advanceRotation(reversed, 0.04).angle < initial.angle)
  for (const angle of [32, 67]) {
    const m = advanceRotation(
      beginRotation(0, 1),
      TAP_SECONDS + (angle - 7.5) / 75,
    )
    assert.ok(Math.abs(degrees(m.angle) - angle) < 1e-8)
  }
  assert.ok(Math.abs(degrees(normalizeRotation(-7.5 / 90)) - 352.5) < 1e-8)
})
test('oriented rectangles reject overlap but preserve empty AABB corners and exact small gaps', () => {
  const a = { x: 0, z: 0, w: 2, d: 0.3, angle: Math.PI / 4 }
  const b = { ...a, x: Math.SQRT1_2, z: Math.SQRT1_2 }
  assert.ok(overlaps(axisBounds(a), axisBounds(b)))
  assert.equal(overlaps(a, b), false)
  assert.ok(Math.abs(planarDistance(a, b) - 0.7) < 1e-8)
  assert.equal(overlaps(a, { ...a, x: 0.1 }), true)
})
for (const angle of [15, 30, 45, 60, 75])
  test(`actual OBB furniture/wall collision at ${angle} degrees keeps the 2 cm margin`, () => {
    const rotation = angle / 90,
      radians = (angle * Math.PI) / 180
    const chair: Item = { id: 'a', kind: 'chair', x: -3.4, z: 0.1, rotation }
    const table: Item = { id: 'b', kind: 'table', x: 0, z: 0, rotation }
    const separation = (catalog.chair.size[1] + catalog.table.size[1]) / 2
    const at = (gap: number) => ({
      ...table,
      x: chair.x + Math.sin(radians) * (separation + gap),
      z: chair.z + Math.cos(radians) * (separation + gap),
    })
    assert.ok(Math.abs(clearanceBetween(chair, at(0.025)) - 0.025) < 1e-8)
    assert.equal(validatePlacement(at(0.025), [chair]), null)
    assert.match(validatePlacement(at(0.015), [chair])!, /2 см/)
    assert.ok(validatePlacement(at(-0.05), [chair]))
    assert.ok(validatePlacement({ ...chair, x: -4.7 }, []))
    const bounds = collisionBounds(chair)
    assert.ok(
      Math.abs(bounds.w - (Math.cos(radians) + Math.sin(radians))) < 1e-8,
    )
  })
test('bin is rotation invariant; carpets use oriented support and avoid false support at AABB corners', () => {
  const bin = initialItems.find((i) => i.kind === 'bin')!
  assert.deepEqual(
    collisionBounds({ ...bin, rotation: 25 / 90 }).w,
    collisionBounds(bin).w,
  )
  const rug = { ...initialItems.find((i) => i.id === 'rug')!, rotation: 0.5 }
  assert.equal(
    floorSupport({ x: rug.x + 2.2, z: rug.z + 2.2, w: 0.1, d: 0.1 }, [rug]),
    FLOOR_TOP,
  )
  assert.ok(
    floorSupport({ x: rug.x, z: rug.z, w: 0.1, d: 0.1 }, [rug]) > FLOOR_TOP,
  )
})
test('surface and drawer local coordinates follow fractional host rotations without losing identity', () => {
  const parent = {
    ...initialItems.find((i) => i.id === 'table')!,
    rotation: 32 / 90,
  }
  const book = {
    ...initialItems.find((i) => i.id === 'book')!,
    rotation: 17 / 90,
  }
  const pose = worldPose(book, [parent, book]),
    local = surfaceLocal(parent, pose.x, pose.z)
  assert.ok(
    Math.abs(local.x - book.x) < 1e-8 && Math.abs(local.z - book.z) < 1e-8,
  )
  assert.ok(Math.abs(degrees(pose.rotation) - 49) < 1e-8)
  assert.equal(validatePlacement(book, [parent, book]), null)
})
test('combined move/rotation is one undoable action and invalid release restores last valid angle', () => {
  let state = createHistory()
  const origin = state.present.find((i) => i.id === 'table')!
  const good = { ...origin, x: -2.5, z: 1, rotation: 67 / 90 }
  const session = rememberPlacement(
    { origin, lastValid: null },
    good,
    state.present,
  )
  assert.ok(session.lastValid)
  const result = resolveDrop(
    session,
    { ...good, x: 0, rotation: 32 / 90 },
    state.present,
  )!
  assert.equal(result.rotation, 67 / 90)
  state = historyReducer(state, { type: 'change', item: result })
  assert.equal(state.past.length, 1)
  const undo = historyReducer(state, { type: 'undo' })
  assert.equal(
    undo.present.find((i) => i.id === origin.id)!.rotation,
    origin.rotation,
  )
  assert.deepEqual(
    historyReducer(undo, { type: 'redo' }).present,
    state.present,
  )
})
