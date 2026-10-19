import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  footprint,
  initialItems,
  snap,
  validatePlacement,
  clearanceBetween,
  minimumGap,
  placementCandidate,
  catalog,
  type Item,
} from '../src/placement'
const table: Item = { id: 'test', kind: 'table', x: -2, z: 0, rotation: 0 }
test('all initial objects have valid placements', () => {
  for (const item of initialItems)
    assert.equal(validatePlacement(item, initialItems), null, item.id)
})
test('checks every outer boundary including rotated furniture', () => {
  for (const candidate of [{ x: -4.9 }, { x: 4.9 }, { z: -3.2 }, { z: 3.2 }])
    assert.ok(validatePlacement({ ...table, ...candidate }, []))
  assert.ok(validatePlacement({ ...table, x: -4.4, rotation: 1, z: -3 }, []))
  assert.equal(validatePlacement({ ...table, x: -3, z: -2.9 }, []), null)
  assert.ok(validatePlacement({ ...table, x: -3, z: -2.9, rotation: 1 }, []))
})
test('rejects partition crossing and keeps the doorway clear', () => {
  assert.ok(validatePlacement({ ...table, x: 0, z: -1 }, []))
  assert.ok(validatePlacement({ ...table, x: 0, z: 1.5 }, []))
  assert.match(validatePlacement({ ...table, x: -0.95, z: 1.5 }, [])!, /проход/)
  assert.match(validatePlacement({ ...table, x: 2.4, z: 2.9 }, [])!, /вход/)
})
test('collision excludes self and accounts for rotated footprint', () => {
  assert.equal(validatePlacement(table, [table]), null)
  assert.ok(validatePlacement(table, [{ ...table, id: 'other' }]))
  assert.deepEqual(footprint({ ...table, rotation: 1 }), [0.85, 1.35])
  assert.equal(validatePlacement({ ...table, x: 2 }, [table]), null)
})
test('soft grid captures near a line and releases continuously into free movement', () => {
  assert.equal(snap(1.36), 1.36)
  assert.equal(snap(-1.36), -1.36)
  assert.equal(snap(1.26), 1.25)
  assert.equal(snap(-1.26), -1.25)
  assert.equal(snap(1.49), 1.5)
})
test('usable room space extends to the wall and beside the narrower passage', () => {
  assert.equal(validatePlacement({ ...table, x: -0.81, z: -1 }, []), null)
  assert.equal(validatePlacement({ ...table, x: -1.25, z: 1.5 }, []), null)
  assert.match(validatePlacement({ ...table, x: -0.9, z: 1.5 }, [])!, /проход/)
})
test('furniture needs 22 cm but decor uses a smaller gap', () => {
  const a = { ...table, x: -3 },
    b: Item = { id: 'cabinet', kind: 'cabinet', x: -3, z: 1, rotation: 0 }
  assert.equal(minimumGap(a, b), 0.22)
  assert.match(validatePlacement(b, [a])!, /отступ 22 см/)
  assert.equal(validatePlacement({ ...b, z: 1.04 }, [a]), null)
  const plant: Item = { id: 'plant', kind: 'plant', x: -3, z: 0, rotation: 0 }
  const lamp: Item = { id: 'lamp', kind: 'lamp', x: -2.25, z: 0, rotation: 0 }
  assert.equal(minimumGap(plant, lamp), 0.06)
  assert.match(validatePlacement(lamp, [plant])!, /отступ 6 см/)
})
test('distance checks preserve diagonal space around rectangles and circular decor', () => {
  const a = { ...table, x: -3 }
  const chair: Item = {
    id: 'chair',
    kind: 'chair',
    x: -1.665,
    z: 1.085,
    rotation: 0,
  }
  assert.ok(clearanceBetween(a, chair) > 0.22)
  assert.equal(validatePlacement(chair, [a]), null)
  const lamp: Item = {
    id: 'lamp',
    kind: 'lamp',
    x: -2.025,
    z: 0.725,
    rotation: 0,
  }
  assert.equal(validatePlacement(lamp, [a]), null)
  assert.ok(validatePlacement({ ...lamp, x: -2.12, z: 0.63 }, [a]))
})
test('rugs overlap furniture in both directions and may cover passage floors', () => {
  const rug: Item = { id: 'rug', kind: 'rug', x: -2.7, z: 0, rotation: 0 }
  assert.equal(catalog.rug.category, 'floorDecor')
  assert.equal(minimumGap(rug, table), 0)
  assert.equal(validatePlacement(rug, [table]), null)
  assert.equal(validatePlacement(table, [rug]), null)
  assert.equal(validatePlacement({ ...rug, x: -1.9, z: 1.4 }, []), null)
  assert.ok(validatePlacement({ ...rug, x: 0 }, []))
  assert.ok(validatePlacement({ ...rug, z: 3 }, []))
})
test('collision feedback does not switch the preview between raw and snapped poses', () => {
  const obstacle = { ...table, x: -3, z: -0.02 }
  const cabinet: Item = {
    id: 'cabinet',
    kind: 'cabinet',
    x: -3,
    z: 1.02,
    rotation: 0,
  }
  const candidate = placementCandidate(cabinet, -3, 1.02)
  assert.equal(candidate.z, snap(1.02))
  const pose = JSON.stringify(candidate)
  assert.ok(validatePlacement(candidate, [obstacle]))
  assert.equal(JSON.stringify(candidate), pose)
  assert.equal(validatePlacement(candidate, []), null)
  const before = placementCandidate(cabinet, -3, 1.0149),
    after = placementCandidate(cabinet, -3, 1.0151)
  assert.ok(Math.abs(before.z - after.z) < 0.0005)
  const free = placementCandidate(cabinet, -3, 1.07)
  assert.equal(free.z, 1.07)
  assert.equal(validatePlacement(free, [obstacle]), null)
})

test('snap is monotonic and has no jumps at capture, release or cell boundaries', () => {
  const step = 0.0005
  let previous = snap(-1.5)
  for (let i = 1; i <= 6000; i++) {
    const value = -1.5 + i * step,
      next = snap(value)
    assert.ok(next >= previous - 1e-10, `reversed at ${value}`)
    assert.ok(next - previous <= 2.5 * step + 1e-10, `jumped at ${value}`)
    previous = next
  }
  for (const boundary of [0.012, 0.025, 0.03, 0.06, 0.125]) {
    assert.ok(
      Math.abs(
        snap(1.25 + boundary + 0.0001) - snap(1.25 + boundary - 0.0001),
      ) < 0.0005,
    )
  }
})
test('rotation uses full visible bed and cabinet bounds', () => {
  const bed = initialItems.find((i) => i.kind === 'bed')!,
    cabinet = initialItems.find((i) => i.kind === 'cabinet')!
  assert.deepEqual(footprint(bed), [2.08, 2.65])
  assert.deepEqual(footprint({ ...cabinet, rotation: 1 }), [0.78, 1.58])
})
