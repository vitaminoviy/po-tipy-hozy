import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  footprint,
  initialItems,
  snap,
  validatePlacement,
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
test('grid rounds positive and negative coordinates to quarter metres', () => {
  assert.equal(snap(1.36), 1.25)
  assert.equal(snap(-1.36), -1.25)
})
