import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, CylinderGeometry, TorusGeometry, Vector3 } from 'three'
import {
  initialItems,
  validatePlacement,
  worldPose,
  collisionBounds,
  floorClearance,
  type Item,
} from '../src/placement'
import { FLOOR_TOP, supportHeight } from '../src/grounding'
import {
  rememberPlacement,
  resolveDrop,
  type PlacementSession,
} from '../src/placementSession'
import { createHistory, historyReducer } from '../src/history'

const cup: Item = { id: 'cup', kind: 'cup', x: -1.5, z: 0, rotation: 0 }
const book: Item = { id: 'book', kind: 'book', x: -1.8, z: 0, rotation: 0 }

test('cup collision bounds tightly enclose the cylinder and handle at every rotation', () => {
  const cylinder = new CylinderGeometry(0.09, 0.07, 0.17, 24)
  cylinder.translate(0, 0.085, 0)
  const handle = new TorusGeometry(0.028, 0.01, 8, 20)
  handle.translate(0.085, 0.105, 0)
  for (let rotation = 0; rotation < 4; rotation++) {
    const item = { ...cup, rotation },
      bounds = collisionBounds(item)
    const actual = new Box3()
    for (const geometry of [cylinder, handle]) {
      const points = geometry.getAttribute('position')
      for (let i = 0; i < points.count; i++)
        actual.expandByPoint(
          new Vector3()
            .fromBufferAttribute(points, i)
            .applyAxisAngle(new Vector3(0, 1, 0), (rotation * Math.PI) / 2)
            .add(new Vector3(item.x, 0, item.z)),
        )
    }
    for (const [value, expected] of [
      [bounds.x - bounds.w / 2, actual.min.x],
      [bounds.x + bounds.w / 2, actual.max.x],
      [bounds.z - bounds.d / 2, actual.min.z],
      [bounds.z + bounds.d / 2, actual.max.z],
    ])
      assert.ok(Math.abs(value - expected) < 1e-6)
  }
  cylinder.dispose()
  handle.dispose()
})

test('tabletop gap and cup edge match visible bounds; drawer safety margins remain unchanged', () => {
  const table = initialItems.find((item) => item.id === 'table')!
  const a = { ...book, x: -0.2, z: 0, surfaceId: 'table' }
  const b = { ...cup, x: 0.1, z: 0, surfaceId: 'table' }
  assert.equal(validatePlacement(b, [table, a]), null) // Visible 3 cm gap, formerly red.
  assert.ok(validatePlacement({ ...b, x: 0.05 }, [table, a]))
  assert.equal(validatePlacement({ ...b, x: 0.54 }, [table]), null) // Handle ends at .663, top ends at .675.
  assert.match(validatePlacement({ ...b, x: 0.555 }, [table])!, /край/)
  const cabinet = {
    ...initialItems.find((item) => item.id === 'cabinet')!,
    drawers: [true, false, false] as [boolean, boolean, boolean],
  }
  assert.match(
    validatePlacement({ ...b, surfaceId: 'cabinet', drawerIndex: 0 }, [
      cabinet,
      { ...a, surfaceId: 'cabinet', drawerIndex: 0 },
    ])!,
    /другой предмет/,
  )
})

test('all three small kinds stand on floor and rugs without attachment or sinking', () => {
  for (const kind of ['cup', 'book', 'box'] as const) {
    const item = { ...cup, kind }
    assert.equal(validatePlacement(item, initialItems), null)
    assert.equal(worldPose(item, []).y, FLOOR_TOP + 0.001)
    assert.equal(
      worldPose(item, initialItems).y,
      supportHeight(item, initialItems) + 0.001,
    )
    assert.ok(worldPose(item, initialItems).y > FLOOR_TOP + 0.001)
    const withoutRugs = initialItems.filter(
      (i) => !['rug', 'bedroomRug'].includes(i.kind),
    )
    assert.equal(worldPose(item, withoutRugs).y, FLOOR_TOP + 0.001)
    assert.equal(item.surfaceId, undefined)
  }
})

test('floor decor can approach low sofa and cabinet geometry without the large furniture reserve', () => {
  const sofa = initialItems.find((item) => item.id === 'sofa')!
  const near = { ...cup, x: sofa.x, z: sofa.z + 0.54 + 0.09 + 0.02 }
  assert.equal(validatePlacement(near, [sofa]), null)
  assert.ok(validatePlacement({ ...near, z: near.z - 0.02 }, [sofa]))
  const cabinet = initialItems.find((item) => item.id === 'cabinet')!
  const beside = { ...cup, x: cabinet.x - 0.75 - 0.123 - 0.02, z: cabinet.z }
  assert.equal(validatePlacement(beside, [cabinet]), null)
  assert.ok(validatePlacement({ ...beside, x: beside.x + 0.03 }, [cabinet]))
  assert.equal(
    validatePlacement({ ...cup, x: -2.8, z: -0.4 }, [
      initialItems.find((item) => item.id === 'table')!,
    ]),
    null,
  ) // Between the legs, not through them.
  assert.ok(
    validatePlacement({ ...cup, x: -2.3, z: -0.12 }, [
      initialItems.find((item) => item.id === 'table')!,
    ]),
  )
})

test('floor collision is symmetric, includes open low drawers and ignores attached decor', () => {
  const sofa = initialItems.find((item) => item.id === 'sofa')!
  assert.ok(validatePlacement({ ...cup, x: sofa.x, z: sofa.z }, [sofa]))
  assert.ok(validatePlacement(sofa, [{ ...cup, x: sofa.x, z: sofa.z }]))
  assert.equal(
    validatePlacement(cup, [
      { ...book, surfaceId: 'table', x: cup.x, z: cup.z },
    ]),
    null,
  )
  assert.ok(validatePlacement(cup, [{ ...book, x: cup.x, z: cup.z }]))
  const cabinet = initialItems.find((item) => item.id === 'cabinet')!
  const front = { ...cup, x: cabinet.x, z: cabinet.z + 0.52 }
  assert.equal(validatePlacement(front, [cabinet]), null)
  assert.ok(
    validatePlacement(front, [{ ...cabinet, drawers: [true, false, false] }]),
  )
  assert.ok(floorClearance({ ...cup, x: sofa.x, z: sofa.z }, sofa) < 0.012)
})

test('floor placement respects room boundaries and rotates the handle collision area', () => {
  for (const invalid of [
    { x: 0, z: 0 },
    { x: -4.86, z: 0 },
    { x: -1, z: 3.37 },
  ])
    assert.ok(validatePlacement({ ...cup, ...invalid }, []))
  const a = { ...book, x: -1.5, z: 0 }
  assert.equal(validatePlacement({ ...cup, x: -1.18, z: 0 }, [a]), null)
  assert.ok(validatePlacement({ ...cup, x: -1.25, z: 0 }, [a]))
})

test('invalid release chooses the last valid snapshot with rotation and records one history action', () => {
  const origin = initialItems.find((item) => item.id === 'table')!
  let session: PlacementSession = { origin, lastValid: null }
  const positions = [
    { ...origin, x: -2, z: 0.5 },
    { ...origin, x: -1.5, z: 0, rotation: 2 },
  ]
  for (const candidate of positions)
    session = rememberPlacement(session, candidate, initialItems)
  const red = { ...origin, x: 0, z: 0, rotation: 1 }
  session = rememberPlacement(session, red, initialItems)
  const settled = resolveDrop(session, red, initialItems)!
  assert.deepEqual(settled, positions[1])
  const history = createHistory()
  const changed = historyReducer(history, { type: 'change', item: settled })
  assert.equal(changed.past.length, 1)
  assert.deepEqual(
    historyReducer(changed, { type: 'undo' }).present,
    history.present,
  )
  assert.deepEqual(
    historyReducer(historyReducer(changed, { type: 'undo' }), { type: 'redo' })
      .present,
    changed.present,
  )
  assert.deepEqual(
    resolveDrop({ origin, lastValid: null }, red, initialItems),
    origin,
  )
})

test('rollback preserves floor/surface/drawer attachments and rejects obsolete drawer snapshots', () => {
  const origin = initialItems.find((item) => item.id === 'cup')!
  const cabinet = {
    ...initialItems.find((item) => item.id === 'cabinet')!,
    drawers: [true, false, false] as [boolean, boolean, boolean],
  }
  const items = [...initialItems.filter((i) => i.id !== 'cabinet'), cabinet]
  let session: PlacementSession = { origin, lastValid: null }
  const floor = { ...cup }
  session = rememberPlacement(session, floor, items)
  const red = { ...cup, x: 0 }
  assert.deepEqual(resolveDrop(session, red, items), floor)
  const drawer = { ...cup, x: 0, z: 0, surfaceId: 'cabinet', drawerIndex: 0 }
  session = rememberPlacement(session, drawer, items)
  assert.deepEqual(resolveDrop(session, red, items), drawer)
  const closed = items.map((i) =>
    i.id === 'cabinet'
      ? { ...i, drawers: [false, false, false] as [boolean, boolean, boolean] }
      : i,
  )
  assert.deepEqual(resolveDrop(session, red, closed), origin)
  const changed = historyReducer(createHistory(), {
    type: 'change',
    item: floor,
  })
  assert.equal(
    changed.present.find((i) => i.id === 'cup')!.surfaceId,
    undefined,
  )
  assert.equal(changed.present.filter((i) => i.id === 'cup').length, 1)
  assert.equal(
    historyReducer(changed, { type: 'undo' }).present.find(
      (i) => i.id === 'cup',
    )!.surfaceId,
    'table',
  )
})
