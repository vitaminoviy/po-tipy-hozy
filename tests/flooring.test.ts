import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createFloors,
  floorCells,
  floorRegions,
  floorRoom,
  floorProgress,
  laySegment,
  finishFloor,
  accessibleAreas,
} from '../src/flooring'
import { createHistory, historyReducer } from '../src/history'
import { initialItems } from '../src/placement'
import {
  floorSampleArea,
  floorSamplePositions,
  floorSampleFootprint,
} from '../src/workArea'
import type { Room } from '../src/cleaning'
const cells = floorCells('living', 'oak')
function band(room: Room = 'living') {
  const m = new Uint8Array(floorCells(room, 'oak').length)
  laySegment(
    m,
    room,
    'oak',
    { x: room === 'living' ? -4 : 0.5, z: 2.5 },
    { x: room === 'living' ? -1 : 4, z: 2.5 },
  )
  return m
}
test('initial floors are independent serializable blank operations', () => {
  const a = createFloors(),
    b = createFloors()
  assert.equal(a.length, 2)
  assert.equal(a[0].material, null)
  assert.equal(a[0].original, 'original-planks')
  assert.equal(floorProgress(a[0]), 0)
  assert.notEqual(a[0].laid, a[1].laid)
  assert.notEqual(a[0].laid, b[0].laid)
})
for (const room of ['living', 'bedroom'] as Room[])
  for (const material of ['oak', 'walnut', 'tile'] as const)
    test(
      'complete real floor grid without overlaps or wall intrusion ' +
        room +
        ' ' +
        material,
      () => {
        const c = floorCells(room, material)
        assert.ok(c.length < 300 && c.length > 50)
        const region = floorRegions(room),
          area = region.reduce(
            (s, r) => s + (r.right - r.left) * (r.front - r.back),
            0,
          )
        assert.ok(Math.abs(c.reduce((s, r) => s + r.area, 0) - area) < 1e-8)
        for (let i = 0; i < c.length; i++) {
          const a = c[i]
          assert.equal(floorRoom(a), room)
          for (let j = i + 1; j < c.length; j++) {
            const b = c[j]
            assert.ok(
              Math.min(a.x + a.w / 2, b.x + b.w / 2) -
                Math.max(a.x - a.w / 2, b.x - b.w / 2) <
                1e-8 ||
                Math.min(a.z + a.d / 2, b.z + b.d / 2) -
                  Math.max(a.z - a.d / 2, b.z - b.d / 2) <
                  1e-8,
            )
          }
        }
      },
    )
test('one movement lays whole cells only along the path and repetition is idempotent', () => {
  const m = band()
  assert.ok(m.some(Boolean))
  assert.ok(m.filter(Boolean).length < cells.length / 4)
  for (let i = 0; i < cells.length; i++)
    if (m[i]) assert.ok(Math.abs(cells[i].z - 2.5) < cells[i].d / 2 + 1e-8)
  const old = m.slice()
  assert.equal(
    laySegment(m, 'living', 'oak', { x: -4, z: 2.5 }, { x: -1, z: 2.5 }),
    false,
  )
  assert.deepEqual(m, old)
})
test('fast diagonal equals finely sampled input and installs every crossed element', () => {
  const a = new Uint8Array(cells.length),
    b = a.slice()
  laySegment(a, 'living', 'oak', { x: -4.7, z: -3 }, { x: -0.5, z: 3 })
  for (let i = 0; i < 100; i++)
    laySegment(
      b,
      'living',
      'oak',
      { x: -4.7 + (4.2 * i) / 100, z: -3 + (6 * i) / 100 },
      { x: -4.7 + (4.2 * (i + 1)) / 100, z: -3 + (6 * (i + 1)) / 100 },
    )
  assert.deepEqual(a, b)
})
test('stationary hold, outdoor pointers, wall crossings and cross-room jumps do not lay anything', () => {
  const m = new Uint8Array(cells.length)
  assert.equal(
    laySegment(m, 'living', 'oak', { x: -2, z: 1 }, { x: -2, z: 1 }),
    false,
  )
  assert.equal(
    laySegment(m, 'living', 'oak', { x: -2, z: 1 }, { x: 2, z: 1 }),
    false,
  )
  assert.equal(
    laySegment(m, 'living', 'oak', { x: -2, z: 1 }, { x: -2, z: 5 }),
    false,
  )
  assert.equal(floorRoom({ x: 0, z: 0 }), null)
  assert.equal(floorRoom({ x: -0.095, z: 0 }), 'living')
  assert.equal(floorRoom({ x: 0.095, z: 0 }), 'bedroom')
  assert.equal(floorRoom({ x: -0.085, z: 0 }), null)
  assert.equal(floorRoom({ x: -4.92, z: 0 }), null)
  assert.equal(floorRoom({ x: -0.05, z: 1.5 }), 'living')
  assert.equal(floorRoom({ x: 0.05, z: 1.5 }), 'bedroom')
  assert.equal(floorRoom({ x: -5, z: 0 }), null)
  assert.ok(m.every((v) => !v))
})
test('progress is area-weighted and depends only on unique installed elements', () => {
  const laid = band(),
    f = finishFloor(createFloors()[0], 'oak', laid, [])!
  const expected =
    cells.reduce((s, c, i) => s + (laid[i] ? c.area : 0), 0) /
    cells.reduce((s, c) => s + c.area, 0)
  assert.equal(floorProgress(f), expected)
  assert.equal(f.complete, false)
})
test('completion fills hidden cells after enough accessible coverage and is recorded once', () => {
  const before = createFloors()[0],
    m = new Uint8Array(cells.length).fill(1)
  m[0] = 0
  const f = finishFloor(before, 'oak', m, initialItems)!
  assert.equal(f.complete, true)
  assert.ok(f.laid.every(Boolean))
  assert.equal(floorProgress(f), 1)
  assert.equal(finishFloor(f, 'oak', m, initialItems), null)
})
test('a nearly obstructed room cannot complete from a tiny visible sliver', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({
    id: 'b' + i,
    kind: 'bed' as const,
    x: -4.2 + (i % 5) * 0.8,
    z: -2.8 + Math.floor(i / 5) * 1.35,
    rotation: 0,
  }))
  const free = accessibleAreas(cells, items)
  const m = new Uint8Array(cells.length)
  for (let i = 0; i < m.length; i++) if (free[i] > 0) m[i] = 1
  const f = finishFloor(createFloors()[0], 'oak', m, items)
  if (f) assert.equal(f.complete, false)
})
test('rotated furniture and rugs obscure accessible area without changing items', () => {
  const before = JSON.stringify(initialItems),
    free = accessibleAreas(cells, initialItems)
  assert.ok(
    free.reduce((a, b) => a + b, 0) < cells.reduce((s, c) => s + c.area, 0),
  )
  assert.equal(JSON.stringify(initialItems), before)
  assert.ok(free.every((v, i) => v >= 0 && v <= cells[i].area + 1e-8))
})
test('material is locked to a room, malformed and decreasing masks are rejected', () => {
  const f = finishFloor(createFloors()[0], 'oak', band(), [])!
  assert.equal(
    finishFloor(
      f,
      'tile',
      new Uint8Array(floorCells('living', 'tile').length).fill(1),
      [],
    ),
    null,
  )
  assert.equal(finishFloor(f, 'oak', new Uint8Array(1), []), null)
  assert.equal(finishFloor(f, 'oak', new Uint8Array(cells.length), []), null)
})
test('a gesture is one undo step; reset is explicit, undoable, and room/dirt/paint/furniture remain independent', () => {
  let h = createHistory(),
    original = h
  h = historyReducer(h, {
    type: 'floor',
    room: 'living',
    material: 'oak',
    laid: band(),
  })
  assert.equal(h.past.length, 1)
  assert.equal(h.present, original.present)
  assert.equal(h.dirt, original.dirt)
  assert.equal(h.paint, original.paint)
  assert.equal(h.floors[1], original.floors[1])
  const done = h
  h = historyReducer(h, { type: 'undo' })
  assert.deepEqual(h.floors, original.floors)
  h = historyReducer(h, { type: 'redo' })
  assert.deepEqual(h.floors, done.floors)
  h = historyReducer(h, { type: 'floor-reset', room: 'living' })
  assert.equal(h.floors[0].material, null)
  h = historyReducer(h, { type: 'undo' })
  assert.deepEqual(h.floors, done.floors)
})
test('finishing gesture can undo back to partial coverage, then redo completion', () => {
  let h = createHistory()
  h = historyReducer(h, {
    type: 'floor',
    room: 'living',
    material: 'oak',
    laid: band(),
  })
  const partial = h.floors[0]
  h = historyReducer(h, {
    type: 'floor',
    room: 'living',
    material: 'oak',
    laid: new Uint8Array(cells.length).fill(1),
  })
  assert.equal(h.floors[0].complete, true)
  h = historyReducer(h, { type: 'undo' })
  assert.deepEqual(h.floors[0], partial)
  h = historyReducer(h, { type: 'redo' })
  assert.equal(h.floors[0].complete, true)
})
test('cancelling a private gesture cannot mutate committed data or another room', () => {
  const h = createHistory(),
    m = band(),
    f = finishFloor(h.floors[0], 'oak', m, [])!
  const privateMask = f.laid.slice()
  privateMask.fill(1)
  assert.ok(floorProgress(f) < 1)
  assert.equal(h.floors[0].material, null)
  assert.equal(h.past.length, 0)
})
test('floor samples have full safe margins and clear the actual doorstep', () => {
  const [x, , z] = floorSampleArea.position,
    [w, , d] = floorSampleArea.size
  assert.ok(x - w / 2 - 3.4 >= 0.2 - 1e-9)
  assert.ok(z - d / 2 - 3.75 >= 0.2 - 1e-9)
  for (const p of Object.values(floorSamplePositions)) {
    assert.ok(p[0] - floorSampleFootprint.w / 2 - (x - w / 2) >= 0.2 - 1e-9)
    assert.ok(x + w / 2 - p[0] - floorSampleFootprint.w / 2 >= 0.2 - 1e-9)
    assert.ok(p[2] - floorSampleFootprint.d / 2 - (z - d / 2) >= 0.2 - 1e-9)
    assert.ok(z + d / 2 - p[2] - floorSampleFootprint.d / 2 >= 0.2 - 1e-9)
  }
})

test('visibility completion requires substantial real area even if all visible cells are done', () => {
  const visible = new Float32Array(cells.length),
    laid = new Uint8Array(cells.length)
  for (let i = 0; i < 2; i++) {
    visible[i] = cells[i].area
    laid[i] = 1
  }
  const next = finishFloor(createFloors()[0], 'oak', laid, [], visible)!
  assert.equal(next.complete, false)
  assert.ok(floorProgress(next) < 0.4)
  for (let i = 0; i < cells.length; i++) {
    laid[i] = i < Math.ceil(cells.length * 0.6) ? 1 : 0
    visible[i] = laid[i] ? cells[i].area : 0
  }
  const complete = finishFloor(createFloors()[0], 'oak', laid, [], visible)!
  assert.equal(complete.complete, true)
  assert.ok(complete.laid.every(Boolean))
})
test('invalid visibility samples cannot bypass completion validation', () => {
  const mask = band()
  for (const values of [
    new Float32Array(1),
    new Float32Array(cells.length).fill(-1),
    new Float32Array(cells.length).fill(NaN),
    new Float32Array(cells.length).fill(100),
  ])
    assert.equal(finishFloor(createFloors()[0], 'oak', mask, [], values), null)
})
test('plank rows are long and staggered while tile interiors are square', () => {
  const wood = cells.filter((c) => c.w > 1),
    tile = floorCells('living', 'tile').filter((c) => c.w > 0.5 && c.d > 0.5)
  assert.ok(wood.every((c) => c.w / c.d > 3))
  assert.ok(tile.every((c) => Math.abs(c.w - c.d) < 1e-8))
  assert.notEqual(
    cells.find((c) => Math.abs(c.z + 3.25) < 1e-8 && c.w > 1)?.x,
    cells.find((c) => Math.abs(c.z + 2.93) < 1e-8 && c.w > 1)?.x,
  )
})
