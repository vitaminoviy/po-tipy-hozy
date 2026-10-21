import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NoColorSpace, LinearFilter, LinearMipmapLinearFilter } from 'three'
import { createPaintTexture, updatePaintTexture } from '../src/paintTexture'
import {
  paintWalls,
  paintGrid,
  createPaint,
  paintSegment,
} from '../src/painting'
test('paint coverage remains linear and opaque in storage with unchanged adaptive dimensions and filtering', () => {
  for (const w of paintWalls) {
    const t = createPaintTexture(w),
      g = paintGrid(w)
    assert.equal(t.image.width, g.width)
    assert.equal(t.image.height, g.height)
    assert.equal(t.colorSpace, NoColorSpace)
    assert.equal(t.flipY, true)
    assert.equal(t.premultiplyAlpha, false)
    assert.equal(t.generateMipmaps, true)
    assert.equal(t.magFilter, LinearFilter)
    assert.equal(t.minFilter, LinearMipmapLinearFilter)
    assert.ok(t.image.data.every((v, i) => v === (i % 4 === 3 ? 255 : 0)))
    t.dispose()
  }
})
test('feather, transparent and solid coverage only affect alphaMap values; backing alpha stays 255 on updates', () => {
  const t = createPaintTexture(paintWalls[0]),
    m = createPaint()[0].mask
  paintSegment(m, paintWalls[0], { x: -1, y: 0 }, { x: 1, y: 0 })
  const before = m.slice()
  updatePaintTexture(t, m)
  for (let i = 0; i < m.length; i++) {
    assert.deepEqual(Array.from(t.image.data.slice(i * 4, i * 4 + 4)), [
      m[i],
      m[i],
      m[i],
      255,
    ])
  }
  assert.deepEqual(m, before)
  const data = t.image.data
  updatePaintTexture(t, m)
  assert.equal(t.image.data, data)
  t.dispose()
})
test('incompatible coverage is rejected rather than uploading a corrupt texture', () => {
  const t = createPaintTexture(paintWalls[0])
  assert.throws(() => updatePaintTexture(t, new Uint8Array(96 ** 2)))
  t.dispose()
})
