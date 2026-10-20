import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialItems,
  validatePlacement,
  worldPose,
  support,
  surfaceAnchors,
  surfaceLocal,
  floorClearance,
  type Item,
} from '../src/placement'
import { softSurfaceZones, furnitureVolumes } from '../src/placementGeometry'
import { upholsteredParts } from '../src/furnitureGeometry'
import { FLOOR_TOP } from '../src/grounding'
import { rememberPlacement, resolveDrop } from '../src/placementSession'
import { createHistory, historyReducer } from '../src/history'
const get = (id: string) => initialItems.find((item) => item.id === id)!
const cup: Item = { id: 'test-cup', kind: 'cup', x: 0, z: 0, rotation: 0 }
const near = (parent: Item, x: number, z: number): Item => ({
  ...cup,
  x:
    parent.x +
    Math.cos((parent.rotation * Math.PI) / 2) * x +
    Math.sin((parent.rotation * Math.PI) / 2) * z,
  z:
    parent.z -
    Math.sin((parent.rotation * Math.PI) / 2) * x +
    Math.cos((parent.rotation * Math.PI) / 2) * z,
  rotation: parent.rotation,
})

test('floor contact uses millimetre clearance and actual base parts for all three upholstered models', () => {
  for (const kind of ['sofa', 'chair', 'bed'] as const)
    for (let rotation = 0; rotation < 4; rotation++) {
      const parent = { ...get(kind), x: -2.5, z: 0, rotation }
      const base = upholsteredParts[kind].find((p) => p.id === 'base')!
      const candidate = near(parent, 0, base.s[2] / 2 + 0.09 + 0.004)
      assert.ok(floorClearance(candidate, parent) > 0.003, kind)
      assert.equal(
        validatePlacement(candidate, [parent]),
        null,
        `${kind} rotation ${rotation}`,
      )
      const touching = near(parent, 0, base.s[2] / 2 + 0.09 - 0.001)
      assert.ok(validatePlacement(touching, [parent]), kind)
    }
})

test('cup can approach a bed corner where its envelope overlaps but its body does not', () => {
  const parent = { ...get('bed'), x: -2.5, z: 0 }
  const diagonal = near(parent, 1 + 0.07, 1.325 + 0.07)
  assert.equal(validatePlacement(diagonal, [parent]), null)
  assert.ok(
    Math.abs(floorClearance(diagonal, parent) - (Math.SQRT2 * 0.07 - 0.09)) <
      1e-10,
  )
  assert.ok(validatePlacement(near(parent, 1 + 0.05, 1.325 + 0.05), [parent]))
})

test('cabinet and nightstand use separate low panels and only vertically overlapping drawer parts', () => {
  const cabinet = { ...get('cabinet'), x: -2.5, z: 0 }
  const book: Item = { ...cup, kind: 'book', x: cabinet.x, z: 0 }
  assert.equal(validatePlacement(book, [cabinet]), null) // Below the first shelf, not inside it.
  assert.ok(validatePlacement({ ...book, kind: 'cup' }, [cabinet]))
  const beside = near(cabinet, -0.75 - 0.123 - 0.004, 0)
  assert.equal(validatePlacement(beside, [cabinet]), null)
  assert.ok(validatePlacement({ ...beside, x: beside.x + 0.006 }, [cabinet]))
  const stand = { ...get('nightstand'), x: -2.5, z: 0, rotation: 0 }
  assert.equal(
    validatePlacement(near(stand, 0.35 + 0.09 + 0.004, 0), [stand]),
    null,
  )
  assert.ok(validatePlacement(near(stand, 0.35 + 0.09 - 0.001, 0), [stand]))
})

test('soft anchors derive their boundaries and height from the rendered parts', () => {
  for (const kind of ['bed', 'sofa', 'chair'] as const) {
    for (const zone of softSurfaceZones(kind)) {
      const part = upholsteredParts[kind].find((p) => p.id === zone.id)!
      assert.equal(zone.height, part.p[1] + part.s[1] / 2)
      assert.deepEqual(zone.size, [part.s[0], part.s[2]])
      assert.equal(zone.centerX, part.p[0])
      assert.equal(zone.center, part.p[2])
    }
    assert.deepEqual(
      surfaceAnchors(get(kind)).map((a) => a.surfaceZone),
      softSurfaceZones(kind).map((z) => z.id),
    )
  }
})

test('cup, book and box all fit real blanket and seat areas with 1 mm contact lift', () => {
  for (const host of ['bed', 'sofa', 'chair'])
    for (const kind of ['cup', 'book', 'box'] as const) {
      const parent = get(host),
        candidate: Item = { ...cup, kind, surfaceId: host, x: 0, z: 0 }
      assert.equal(
        validatePlacement(candidate, [parent]),
        null,
        `${kind} on ${host}`,
      )
      const top = support(candidate, parent)!
      assert.ok(
        Math.abs(worldPose(candidate, [parent]).y - top.height - 0.001) < 1e-10,
      )
      assert.match(validatePlacement({ ...candidate, x: 2 }, [parent])!, /край/)
    }
})

test('soft parent parts block pillows, backrests, arms and a raised blanket fold', () => {
  const sofa = get('sofa'),
    bed = get('bed'),
    chair = get('chair')
  assert.match(
    validatePlacement({ ...cup, surfaceId: 'sofa', x: 0, z: -0.2 }, [sofa])!,
    /спинку|подлокотник|выступ/,
  )
  assert.match(
    validatePlacement(
      { ...cup, surfaceId: 'sofa', surfaceZone: 'seat-0.53', x: 0.35, z: 0 },
      [sofa],
    )!,
    /подлокотник/,
  )
  assert.ok(validatePlacement({ ...cup, surfaceId: 'chair', x: 0.3 }, [chair]))
  assert.match(
    validatePlacement(
      { ...cup, surfaceId: 'bed', surfaceZone: 'blanket', z: 0.38 },
      [bed],
    )!,
    /выступ/,
  )
  assert.equal(
    validatePlacement({ ...cup, surfaceId: 'bed', surfaceZone: 'fold', z: 0 }, [
      bed,
    ]),
    null,
  )
  assert.ok(
    validatePlacement(
      { ...cup, surfaceId: 'bed', surfaceZone: 'mattress', x: 0.48, z: -0.86 },
      [bed],
    ),
  )
  assert.ok(
    validatePlacement(
      { ...cup, surfaceId: 'bed', surfaceZone: 'nonexistent' },
      [bed],
    ),
  )
})

test('items in different soft zones compare world positions, and all four host rotations preserve anchors', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const parent = { ...get('sofa'), x: -2.5, z: 0, rotation }
    const a = { ...cup, surfaceId: 'sofa', surfaceZone: 'seat--0.53' },
      b = { ...cup, id: 'other', surfaceId: 'sofa', surfaceZone: 'seat-0.53' }
    assert.equal(validatePlacement(a, [parent, b]), null) // Local x/z equal; world positions differ by 1.06 m.
    assert.ok(
      validatePlacement(a, [parent, { ...b, surfaceZone: a.surfaceZone }]),
    )
    const world = worldPose(b, [parent]),
      local = surfaceLocal(parent, world.x, world.z)
    assert.ok(Math.abs(local.x - 0.53) < 1e-10)
    assert.ok(Math.abs(local.z - 0.03) < 1e-10)
    assert.equal(world.rotation, rotation)
  }
})

test('soft attachments follow host moves and rotations through history and retain the last valid zone', () => {
  const parent = get('bed'),
    original = get('cup')
  const valid = {
    ...original,
    x: 0,
    z: 0,
    surfaceId: 'bed',
    surfaceZone: 'blanket',
  }
  const red = { ...valid, z: 0.38 }
  const session = rememberPlacement(
    { origin: original, lastValid: null },
    valid,
    initialItems,
  )
  assert.deepEqual(resolveDrop(session, red, initialItems), valid)
  let history = historyReducer(createHistory(), {
    type: 'change',
    item: resolveDrop(session, red, initialItems)!,
  })
  assert.equal(history.past.length, 1)
  assert.equal(
    historyReducer(history, { type: 'undo' }).present.find(
      (i) => i.id === 'cup',
    )!.surfaceId,
    'table',
  )
  const moved = { ...parent, x: 2.5, z: -1.5, rotation: 1 }
  history = historyReducer(history, { type: 'change', item: moved })
  const pose = worldPose(
    history.present.find((i) => i.id === 'cup')!,
    history.present,
  )
  assert.ok(Math.abs(pose.x - (2.5 + 0.35)) < 1e-10)
  assert.ok(Math.abs(pose.z + 1.5) < 1e-10)
  assert.deepEqual(
    historyReducer(historyReducer(history, { type: 'undo' }), { type: 'redo' })
      .present,
    history.present,
  )
  assert.equal(history.present.filter((i) => i.id === 'cup').length, 1)
})

test('furniture volume primitives share upholstery geometry and model hollow cabinets without global inflation', () => {
  for (const kind of ['sofa', 'chair', 'bed'] as const) {
    const volumes = furnitureVolumes(get(kind), FLOOR_TOP)
    assert.equal(volumes.length, upholsteredParts[kind].length)
    for (const [index, part] of upholsteredParts[kind].entries()) {
      assert.equal(volumes[index].p[0], part.p[0])
      assert.equal(volumes[index].s[0], part.s[0])
    }
  }
})
