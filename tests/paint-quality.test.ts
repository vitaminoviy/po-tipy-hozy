import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  paintGrid,
  paintWalls,
  createPaint,
  paintSegment,
  pixelPoint,
  onWall,
  paintFraction,
  finishPaint,
  fillPaint,
} from '../src/painting'
import { MASK_SIZE } from '../src/wiping'
import { toolPositions, toolFootprints, workArea } from '../src/workArea'
test('paint uses bounded world-space density and proportional rectangular grids without changing floor masks', () => {
  assert.equal(MASK_SIZE, 96)
  assert.deepEqual(paintGrid(paintWalls[0]), {
    width: 448,
    height: 192,
    length: 86016,
  })
  let bytes = 0
  for (const w of paintWalls) {
    const g = paintGrid(w)
    bytes += g.length
    assert.ok(g.width <= 512 && g.height <= 512)
    assert.ok(w.w / g.width <= 1 / 64)
    assert.ok(w.h / g.height <= 1 / 64)
    assert.equal(
      createPaint().find((s) => s.id === w.id)!.mask.length,
      g.length,
    )
  }
  assert.ok(bytes < 512 * 1024)
})
test('high resolution diagonal is continuous, solid in its core and feathered only near its edge', () => {
  const w = paintWalls[0],
    mask = createPaint()[0].mask
  paintSegment(mask, w, { x: -2, y: -0.5 }, { x: 2, y: 0.5 })
  assert.ok(mask.some((v) => v > 0 && v < 255))
  assert.ok(mask.some((v) => v === 255))
  for (let i = 0; i < mask.length; i++) {
    const p = pixelPoint(w, i)
    if (Math.abs(p.y) > 0.65) assert.equal(mask[i], 0)
    if (Math.abs(p.x) < 1.8 && Math.abs(p.y - p.x * 0.25) < 0.015)
      assert.equal(mask[i], 255)
  }
  const before = mask.slice()
  assert.equal(
    paintSegment(mask, w, { x: 2, y: 0.5 }, { x: -2, y: -0.5 }),
    false,
  )
  assert.deepEqual(mask, before)
})
test('fast and finely sampled high-resolution strokes have the same coverage without extra paint on repeats', () => {
  const w = paintWalls[0],
    fast = createPaint()[0].mask,
    slow = fast.slice()
  paintSegment(fast, w, { x: -2, y: -0.6 }, { x: 2, y: 0.6 })
  for (let i = 0; i < 100; i++)
    paintSegment(
      slow,
      w,
      { x: -2 + i * 0.04, y: -0.6 + i * 0.012 },
      { x: -2 + (i + 1) * 0.04, y: -0.6 + (i + 1) * 0.012 },
    )
  assert.ok(Math.abs(paintFraction(fast, w) - paintFraction(slow, w)) < 0.00001)
  assert.ok(fast.every((v, i) => Math.abs(v - slow[i]) <= 1))
})
test('adaptive completion preserves window/frame exclusions and rejects an obsolete 96-square paint mask', () => {
  const w = paintWalls.find((w) => w.id === 'living-rear')!,
    before = createPaint().find((s) => s.id === w.id)!,
    mask = before.mask.slice()
  fillPaint(mask, w)
  assert.equal(paintFraction(mask, w), 1)
  const next = finishPaint(before, 'sage', mask)!
  for (let i = 0; i < mask.length; i++)
    if (!onWall(w, pixelPoint(w, i))) assert.equal(next.mask[i], 0)
  assert.equal(
    finishPaint(before, 'sage', new Uint8Array(96 ** 2).fill(255)),
    null,
  )
})
function bounds(id: keyof typeof toolPositions) {
  const [x, , z] = toolPositions[id],
    f = toolFootprints[id]
  return {
    left: x - f.left,
    right: x + f.right,
    back: z - f.back,
    front: z + f.front,
  }
}
test('every complete tool footprint including handle and can feet stays at least 20cm inside its platform', () => {
  const [x, , z] = workArea.position,
    [w, , d] = workArea.size
  for (const id of Object.keys(
    toolPositions,
  ) as (keyof typeof toolPositions)[]) {
    const b = bounds(id)
    assert.ok(b.left - (x - w / 2) >= workArea.safeInset - 1e-9, id)
    assert.ok(x + w / 2 - b.right >= workArea.safeInset - 1e-9, id)
    assert.ok(b.back - (z - d / 2) >= workArea.safeInset - 1e-9, id)
    assert.ok(z + d / 2 - b.front >= workArea.safeInset - 1e-9, id)
  }
})
test('tools have deliberate intervals and the complete service platform clears the actual House doorstep', () => {
  const ids = Object.keys(toolPositions) as (keyof typeof toolPositions)[]
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = bounds(ids[i]),
        b = bounds(ids[j])
      assert.ok(
        Math.max(
          b.left - a.right,
          a.left - b.right,
          b.back - a.front,
          a.back - b.front,
        ) >=
          0.15 - 1e-9,
        ids[i] + ' ' + ids[j],
      )
    }
  // House.tsx step: center X=2.4, Z=3.9, width=2, depth=.7.
  assert.ok(1.4 - (workArea.position[0] + workArea.size[0] / 2) >= 0.15 - 1e-9)
  const jar = bounds('terracotta')
  assert.ok(
    Math.hypot(Math.max(0, 1.4 - jar.right), Math.max(0, jar.back - 4.25)) >
      0.4,
  )
})
