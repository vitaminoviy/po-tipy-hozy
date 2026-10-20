import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialItems, type Item } from '../src/placement'
import { FLOOR_TOP, supportHeight, panelToSurface } from '../src/grounding'
import { partsOnSurface, upholsteredParts } from '../src/furnitureGeometry'

for (const kind of ['sofa', 'chair', 'bed'] as const) {
  test(`${kind}: base touches floor/rug and original seating height stays fixed`, () => {
    const top = { sofa: 0.725, chair: 0.73, bed: 0.5 }[kind]
    for (const surface of [FLOOR_TOP, 0.036, 0.039, 0.042, 0.045]) {
      const parts = partsOnSurface(kind, surface),
        base = parts.find((p) => p.id === 'base')!
      assert.ok(Math.abs(base.p[1] - base.s[1] / 2 - surface) < 1e-10)
      assert.ok(Math.abs(base.p[1] + base.s[1] / 2 - top) < 1e-10)
      assert.ok(base.s[1] > 0)
      assert.deepEqual(
        parts.filter((p) => p.id !== 'base'),
        upholsteredParts[kind].filter((p) => p.id !== 'base'),
      )
    }
  })
}
test('support uses actual rug body and raised stripes, also after rotations and rug moves', () => {
  const rug: Item = { id: 'rug', kind: 'rug', x: -2.5, z: 0, rotation: 0 }
  const item: Item = { id: 'chair', kind: 'chair', x: -2.5, z: 0, rotation: 0 }
  assert.equal(supportHeight(item, []), FLOOR_TOP)
  assert.ok(Math.abs(supportHeight(item, [rug]) - 0.036) < 1e-10)
  assert.ok(Math.abs(supportHeight({ ...item, z: 1.5 }, [rug]) - 0.042) < 1e-10)
  assert.ok(
    Math.abs(
      supportHeight({ ...item, x: -1 }, [{ ...rug, rotation: 1 }]) - 0.042,
    ) < 1e-10,
  )
  assert.equal(supportHeight(item, [{ ...rug, x: 3 }]), FLOOR_TOP)
  assert.ok(
    Math.abs(supportHeight(item, [{ ...rug, kind: 'bedroomRug' }]) - 0.039) <
      1e-10,
  )
  assert.ok(
    Math.abs(
      supportHeight({ ...item, z: 2 }, [{ ...rug, kind: 'bedroomRug' }]) -
        0.045,
    ) < 1e-10,
  )
})
test('cabinet and nightstand support panels extend down without moving their tops or drawers', () => {
  for (const [p, s] of [
    [
      [0, 0.65, 0],
      [0.08, 1.1, 0.65],
    ],
    [
      [0, 0.4, 0],
      [0.05, 0.7, 0.6],
    ],
    [
      [0, 0.2, 0],
      [0.6, 0.3, 0.6],
    ],
  ] as const) {
    const panel = panelToSurface([...p], [...s], FLOOR_TOP)
    assert.ok(Math.abs(panel.p[1] - panel.s[1] / 2 - FLOOR_TOP) < 1e-10)
    assert.ok(Math.abs(panel.p[1] + panel.s[1] / 2 - (p[1] + s[1] / 2)) < 1e-10)
  }
  // Grounding is visual only: no state is moved, reattached or persisted.
  const before = structuredClone(initialItems)
  for (const item of initialItems) supportHeight(item, initialItems)
  assert.deepEqual(initialItems, before)
})
