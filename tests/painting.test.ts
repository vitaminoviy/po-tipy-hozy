import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  paintGrid,
  createPaint,
  paintWalls,
  paintColors,
  paintFraction,
  paintComplete,
  paintSegment,
  finishPaint,
  wallLocal,
  wallExit,
} from '../src/painting'
import { createHistory, historyReducer } from '../src/history'
import { cleanFraction } from '../src/wiping'
const wall = paintWalls[0],
  grid = paintGrid(wall)
const line = (mask: Uint8Array, y = 0, face = wall) =>
  paintSegment(
    mask,
    face,
    { x: -face.w / 2 + 0.08, y },
    { x: face.w / 2 - 0.08, y },
  )
test('stable blank paint masks are independent across both rooms', () => {
  const a = createPaint(),
    b = createPaint()
  assert.equal(a.length, paintWalls.length)
  assert.deepEqual(a, b)
  assert.notEqual(a[0].mask, a[1].mask)
  assert.equal(paintFraction(a[0].mask), 0)
  assert.equal(a[0].color, null)
  assert.equal(a[0].mask.length, grid.length)
  assert.equal(new Set(paintWalls.map((w) => w.room)).size, 2)
})
test('palette has exactly three requested colors; first changed stroke locks only its wall', () => {
  assert.deepEqual(
    Object.values(paintColors).map((c) => c.hex),
    ['#E9D8BA', '#A7B7A1', '#CA8E78'],
  )
  const before = createPaint()[0],
    mask = before.mask.slice()
  line(mask)
  const next = finishPaint(before, 'sage', mask)!
  assert.equal(next.color, 'sage')
  assert.equal(before.color, null)
  assert.equal(paintFraction(before.mask), 0)
  assert.equal(finishPaint(next, 'cream', mask), null)
})
test('one stroke paints only a narrow band, preserves the rest and has real alpha coverage', () => {
  const mask = createPaint()[0].mask
  assert.ok(line(mask))
  const f = paintFraction(mask)
  assert.ok(f > 0.05 && f < 0.2)
  assert.equal(mask[0], 0)
  assert.equal(
    mask[Math.floor(grid.height / 2) * grid.width + Math.floor(grid.width / 2)],
    255,
  )
  assert.ok(mask.some((v) => v > 0 && v < 255))
  assert.equal(f, mask.reduce((sum, v) => sum + v, 0) / (255 * grid.length))
})
test('repeat and reversed strokes are idempotent even at feathered edges', () => {
  const mask = createPaint()[0].mask
  line(mask)
  const before = mask.slice(),
    f = paintFraction(mask)
  assert.equal(line(mask), false)
  paintSegment(
    mask,
    wall,
    { x: wall.w / 2 - 0.08, y: 0 },
    { x: -wall.w / 2 + 0.08, y: 0 },
  )
  assert.deepEqual(mask, before)
  assert.equal(paintFraction(mask), f)
})
test('clicks and stationary holds never gain progress or lock a color', () => {
  const before = createPaint()[0]
  assert.equal(
    paintSegment(before.mask, wall, { x: 0, y: 0 }, { x: 0, y: 0 }),
    false,
  )
  assert.equal(finishPaint(before, 'sage', before.mask), null)
})
test('fast diagonal swept stroke matches subdivided input, without gaps along the path', () => {
  const a = createPaint()[0].mask,
    b = a.slice()
  paintSegment(a, wall, { x: -1, y: -0.5 }, { x: 1, y: 0.5 })
  for (let n = 0; n < 80; n++)
    paintSegment(
      b,
      wall,
      { x: -1 + n / 40, y: -0.5 + n / 80 },
      { x: -1 + (n + 1) / 40, y: -0.5 + (n + 1) / 80 },
    )
  assert.ok(Math.abs(paintFraction(a) - paintFraction(b)) < 0.0001)
  for (let n = 10; n < 80; n++) {
    const col = Math.floor(((-1 + n / 40) / wall.w + 0.5) * grid.width),
      row = Math.floor((0.5 - (-0.5 + n / 80) / wall.h) * grid.height)
    assert.equal(a[row * grid.width + col], 255)
  }
})
test('outside endpoints are rejected; disconnected re-entry cannot bridge through the wall', () => {
  const mask = createPaint()[0].mask
  assert.equal(paintSegment(mask, wall, { x: -4, y: 0 }, { x: 0, y: 0 }), false)
  assert.equal(paintSegment(mask, wall, { x: 0, y: 0 }, { x: 0, y: 4 }), false)
  assert.equal(paintFraction(mask), 0)
})
test('wall local coordinates use the actual surface basis and consistent top-row orientation', () => {
  const local = wallLocal(wall, { y: wall.y + 0.4, z: wall.z - 0.6 })
  assert.ok(Math.abs(local.x - 0.6) < 1e-10 && Math.abs(local.y - 0.4) < 1e-10)
  const mask = createPaint()[0].mask
  line(mask, 0.45)
  assert.ok(
    mask
      .slice(0, grid.width * Math.floor(grid.height * 0.45))
      .some((v) => v > 0),
  )
  assert.ok(
    mask.slice(grid.width * Math.ceil(grid.height * 0.6)).every((v) => v === 0),
  )
})
test('coverage reaches threshold then fills remaining pixels once on gesture commit', () => {
  const before = createPaint()[0],
    mask = before.mask.slice()
  for (let y = -wall.h / 2 + 0.005; y <= wall.h / 2; y += 0.1) line(mask, y)
  assert.ok(paintComplete(mask))
  const next = finishPaint(before, 'terracotta', mask)!
  assert.equal(paintFraction(next.mask), 1)
  assert.ok(next.mask.every((v) => v === 255))
  assert.equal(finishPaint(next, 'terracotta', next.mask), null)
})
test('wrong lengths, unknown walls, decreasing masks and no-op commits do not add history', () => {
  const h = createHistory(),
    wall = h.paint[0]
  assert.equal(
    historyReducer(h, {
      type: 'paint',
      id: 'absent',
      color: 'sage',
      mask: wall.mask,
    }),
    h,
  )
  assert.equal(finishPaint(wall, 'sage', new Uint8Array(8)), null)
  assert.equal(
    historyReducer(h, {
      type: 'paint',
      id: wall.id,
      color: 'sage',
      mask: wall.mask,
    }),
    h,
  )
  const mask = wall.mask.slice()
  line(mask)
  const painted = finishPaint(wall, 'sage', mask)!
  assert.equal(finishPaint(painted, 'sage', wall.mask), null)
})
test('three gestures make three immutable history actions; undo/redo restores masks, color and progress', () => {
  const initial = createHistory()
  let h = initial
  for (const y of [-0.4, 0, 0.4]) {
    const mask = h.paint[0].mask.slice()
    line(mask, y)
    h = historyReducer(h, { type: 'paint', id: wall.id, color: 'sage', mask })
    mask.fill(0)
  }
  assert.equal(h.past.length, 3)
  const end = h.paint[0].mask.slice()
  for (let n = 0; n < 3; n++) h = historyReducer(h, { type: 'undo' })
  assert.equal(h.paint[0].color, null)
  assert.equal(paintFraction(h.paint[0].mask), 0)
  for (let n = 0; n < 3; n++) h = historyReducer(h, { type: 'redo' })
  assert.deepEqual(h.paint[0].mask, end)
  assert.equal(h.paint[0].color, 'sage')
  assert.equal(paintFraction(initial.paint[0].mask), 0)
})
test('two walls can keep different colors; canceling a private gesture cannot mutate either or history', () => {
  let h = createHistory()
  for (const [n, color] of [
    [0, 'sage'],
    [1, 'cream'],
  ] as const) {
    const mask = h.paint[n].mask.slice()
    line(mask, 0, paintWalls[n])
    h = historyReducer(h, { type: 'paint', id: h.paint[n].id, color, mask })
  }
  const cancelled = h.paint[0].mask.slice()
  line(cancelled, 0.4)
  assert.equal(h.paint[0].color, 'sage')
  assert.equal(h.paint[1].color, 'cream')
  assert.equal(h.past.length, 2)
  assert.notDeepEqual(h.paint[0].mask, cancelled)
})
test('furniture, trash, dirt and wall history stay chronological and independent', () => {
  let h = createHistory()
  const mask = h.paint[0].mask.slice()
  line(mask)
  h = historyReducer(h, { type: 'paint', id: wall.id, color: 'sage', mask })
  const painted = h.paint
  h = historyReducer(h, { type: 'lamp', id: 'lamp' })
  h = historyReducer(h, { type: 'trash-start', id: 'trash-l1' })
  h = historyReducer(h, {
    type: 'trash-dispose',
    id: 'trash-l1',
    binId: 'bin-living',
  })
  h = historyReducer(h, {
    type: 'wipe',
    id: h.dirt[0].id,
    mask: new Uint8Array(96 ** 2),
  })
  assert.equal(h.paint, painted)
  assert.equal(cleanFraction(h.dirt[0].mask), 1)
  for (let n = 0; n < 3; n++) h = historyReducer(h, { type: 'undo' })
  assert.equal(h.paint, painted)
  h = historyReducer(h, { type: 'undo' })
  assert.equal(paintFraction(h.paint[0].mask), 0)
})
test('undo of completion restores partial paint, redo restores completion; new paint clears redo', () => {
  let h = createHistory()
  let mask = h.paint[0].mask.slice()
  line(mask)
  h = historyReducer(h, { type: 'paint', id: wall.id, color: 'sage', mask })
  const partial = h.paint[0].mask.slice()
  mask.fill(255)
  h = historyReducer(h, { type: 'paint', id: wall.id, color: 'sage', mask })
  h = historyReducer(h, { type: 'undo' })
  assert.deepEqual(h.paint[0].mask, partial)
  h = historyReducer(h, { type: 'redo' })
  assert.equal(paintFraction(h.paint[0].mask), 1)
  h = historyReducer(h, { type: 'undo' })
  mask = h.paint[0].mask.slice()
  line(mask, 0.4)
  h = historyReducer(h, { type: 'paint', id: wall.id, color: 'sage', mask })
  assert.equal(h.future.length, 0)
})

test('undo to a blank wall unlocks its color and a new color discards the old redo branch', () => {
  let h = createHistory()
  let mask = h.paint[0].mask.slice()
  line(mask)
  h = historyReducer(h, { type: 'paint', id: wall.id, color: 'sage', mask })
  h = historyReducer(h, { type: 'undo' })
  mask = h.paint[0].mask.slice()
  line(mask, 0.3)
  h = historyReducer(h, { type: 'paint', id: wall.id, color: 'cream', mask })
  assert.equal(h.paint[0].color, 'cream')
  assert.equal(h.future.length, 0)
  assert.equal(h.paint[1].color, null)
})

test('fast exits clip to the visible rectangle edge without painting outside or reconnecting later input', () => {
  const from = { x: 0, y: 0 },
    exit = wallExit(wall, from, { x: 5, y: 0 })
  assert.ok(Math.abs(exit.x - wall.w / 2) < 1e-10)
  assert.equal(exit.y, 0)
  const mask = createPaint()[0].mask
  assert.ok(paintSegment(mask, wall, from, exit))
  assert.equal(
    mask[Math.floor(grid.height / 2) * grid.width + grid.width - 1],
    255,
  )
  assert.equal(mask[Math.floor(grid.height / 2) * grid.width], 0)
  assert.equal(mask[0], 0)
  const corner = wallExit(wall, from, { x: 5, y: 5 })
  assert.ok(Math.abs(corner.y - wall.h / 2) < 1e-10)
  assert.ok(corner.x <= wall.w / 2)
})
