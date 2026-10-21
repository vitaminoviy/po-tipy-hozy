import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  paintGrid,
  paintWalls,
  createPaint,
  wallExit,
  wallWorld,
  wallLocal,
  onWall,
  paintSegment,
  paintFraction,
  fillPaint,
  paintedArea,
  finishPaint,
  pixelPoint,
} from '../src/painting'
test('all existing inner wall faces have stable IDs and reversible local bases', () => {
  assert.equal(paintWalls.length, 12)
  assert.equal(new Set(paintWalls.map((w) => w.id)).size, 12)
  for (const w of paintWalls) {
    const p = { x: w.w * 0.25, y: w.h * 0.25 }
    const q = wallLocal(w, wallWorld(w, p))
    assert.ok(Math.abs(p.x - q.x) < 1e-10)
    assert.ok(Math.abs(p.y - q.y) < 1e-10)
  }
})
test('rear windows, frames and sills are excluded both from brush pixels and final completion', () => {
  for (const w of paintWalls.filter((w) => w.id.endsWith('rear'))) {
    assert.equal(onWall(w, { x: 0, y: 0.17 }), false)
    const mask = new Uint8Array(paintGrid(w).length)
    paintSegment(mask, w, { x: -2, y: 0.17 }, { x: 2, y: 0.17 })
    for (let i = 0; i < mask.length; i++)
      if (!onWall(w, pixelPoint(w, i))) assert.equal(mask[i], 0)
    fillPaint(mask, w)
    assert.equal(paintFraction(mask, w), 1)
    const next = finishPaint(
      createPaint().find((s) => s.id === w.id)!,
      'sage',
      mask,
    )!
    for (let i = 0; i < mask.length; i++)
      if (!onWall(w, pixelPoint(w, i))) assert.equal(next.mask[i], 0)
  }
})
test('door gap has no painting surface; only the original lintel and cutaway wall remain', () => {
  for (const w of paintWalls.filter((w) => w.x === 0.098 || w.x === -0.098)) {
    const p = wallLocal(w, { x: w.x, y: 1.3, z: 1.55 })
    assert.equal(onWall(w, p), false)
  }
})
test('room completion uses physical face areas rather than averaging large and small masks', () => {
  const states = createPaint()
  const w = paintWalls.find((w) => w.id === 'living-door-top')!
  fillPaint(states.find((s) => s.id === w.id)!.mask, w)
  const fraction = paintedArea(states, 'living')
  assert.ok(fraction > 0 && fraction < 0.03)
  assert.equal(paintedArea(states, 'bedroom'), 0)
  for (const w of paintWalls.filter((w) => w.room === 'living'))
    fillPaint(states.find((s) => s.id === w.id)!.mask, w)
  assert.equal(paintedArea(states, 'living'), 1)
})

test('a fast exit into a window clips the valid tail at its frame edge', () => {
  const w = paintWalls.find((w) => w.id === 'living-rear')!
  const exit = wallExit(w, { x: -2, y: 0.19 }, { x: 0, y: 0.19 })
  assert.ok(exit.x < -1.15 && exit.x > -1.151)
  assert.ok(onWall(w, exit))
  const mask = createPaint().find((s) => s.id === w.id)!.mask
  assert.ok(paintSegment(mask, w, { x: -2, y: 0.19 }, exit))
})

test('forged paint only inside an opening and unknown walls cannot lock a color or create history', () => {
  const w = paintWalls.find((w) => w.id === 'living-rear')!
  const before = createPaint().find((s) => s.id === w.id)!
  const mask = before.mask.slice()
  for (let i = 0; i < mask.length; i++)
    if (!onWall(w, pixelPoint(w, i))) mask[i] = 255
  assert.equal(finishPaint(before, 'sage', mask), null)
  assert.equal(finishPaint({ ...before, id: 'unknown' }, 'sage', mask), null)
})
