import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureWorld, restoreWorld, type WorldSave } from '../src/saveModel'
import {
  SaveQueue,
  SaveConflict,
  validRevision,
  type ProgressStorage,
  type SaveRecord,
} from '../src/saveStorage'
import { createHistory, historyReducer } from '../src/history'
import { floorCells } from '../src/flooring'
import { paintSegment, paintWalls } from '../src/painting'
import { dirtPatches, wipeSegment } from '../src/wiping'

class MemoryStorage implements ProgressStorage {
  record?: SaveRecord
  fail = false
  async read() {
    return structuredClone(this.record)
  }
  async write(expected: number, world: WorldSave | null) {
    await new Promise((r) => setTimeout(r, 1))
    if (this.fail) throw new Error('QuotaExceededError')
    if ((this.record?.revision ?? 0) !== expected) throw new SaveConflict()
    this.record = structuredClone({ revision: expected + 1, world })
    return expected + 1
  }
}
const roundtrip = (h = createHistory()) =>
  restoreWorld(structuredClone(captureWorld(h)))
test('revision metadata rejects invalid types, unsafe counters and non-finite values', () => {
  for (const v of [
    null,
    undefined,
    '1',
    0,
    -1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
  ])
    assert.equal(validRevision(v), false)
  assert.equal(validRevision(1), true)
  assert.equal(validRevision(Date.now()), true)
})
test('new world roundtrips with empty undo history and stable object IDs', () => {
  const h = createHistory(),
    restored = roundtrip(h)
  assert.deepEqual(restored, h)
  assert.equal(new Set(restored.present.map((i) => i.id)).size, 15)
})
test('creates and reads a structured save without JSON conversion', async () => {
  const s = new MemoryStorage(),
    q = new SaveQueue(s, 0)
  await q.write(captureWorld(createHistory()))
  assert.equal((await s.read())?.revision, 1)
  assert.equal(roundtrip().paint[0].mask instanceof Uint8Array, true)
})
for (const version of [0, 2, undefined])
  test(`rejects incompatible schema ${version}`, () => {
    assert.throws(
      () =>
        restoreWorld({
          ...captureWorld(createHistory()),
          schemaVersion: version,
        }),
      /версия/,
    )
  })
test('keeps furniture coordinates and arbitrary fractional angles exactly', () => {
  const h = createHistory()
  const table = h.present.find((i) => i.id === 'table')!
  h.present = h.present.map((i) =>
    i.id === table.id ? { ...i, x: -2.5, z: -0.25, rotation: 37.5 / 90 } : i,
  )
  assert.deepEqual(roundtrip(h).present, h.present)
})
test('keeps attached decor relative to its parent, without duplicates', () => {
  const h = roundtrip()
  assert.equal(h.present.find((i) => i.id === 'book')?.surfaceId, 'table')
  assert.equal(h.present.filter((i) => i.id === 'book').length, 1)
})
test('restores stored contents even when their drawer is closed', () => {
  const h = createHistory()
  h.present = h.present.map((i) =>
    i.id === 'book'
      ? { ...i, surfaceId: 'nightstand', drawerIndex: 0, x: 0, z: 0 }
      : i.id === 'nightstand'
        ? { ...i, drawers: [false, false, false] }
        : i,
  )
  assert.equal(
    roundtrip(h).present.find((i) => i.id === 'book')?.drawerIndex,
    0,
  )
})
test('restores open drawers and lamp state', () => {
  let h = historyReducer(createHistory(), { type: 'lamp', id: 'lamp' })
  h = historyReducer(h, { type: 'drawer', id: 'cabinet', index: 0 })
  assert.equal(roundtrip(h).present.find((i) => i.id === 'lamp')?.lampOn, true)
  assert.equal(
    roundtrip(h).present.find((i) => i.id === 'cabinet')?.drawers?.[0],
    true,
  )
})
test('only disposed trash persists; selection and interrupted flight revert to room', () => {
  const h = createHistory()
  h.trash[0].state = 'disposed'
  h.trash[1].state = 'disposing'
  h.trash[2].state = 'selected'
  assert.deepEqual(
    roundtrip(h)
      .trash.slice(0, 3)
      .map((t) => t.state),
    ['disposed', 'room', 'room'],
  )
})
test('restores exact partially wiped mask, independently of paint', () => {
  const h = createHistory(),
    mask = h.dirt[0].mask.slice()
  wipeSegment(mask, dirtPatches[0], { x: -0.3, z: 0 }, { x: 0.3, z: 0 })
  h.dirt[0] = { ...h.dirt[0], mask }
  assert.deepEqual(roundtrip(h).dirt, h.dirt)
})
for (const color of ['cream', 'sage', 'terracotta'] as const)
  test(`restores ${color} wall coverage byte for byte with separate color`, () => {
    const h = createHistory(),
      mask = h.paint[0].mask.slice()
    paintSegment(mask, paintWalls[0], { x: -0.8, y: 0.7 }, { x: 0.5, y: 0.7 })
    h.paint[0] = { ...h.paint[0], mask, color }
    assert.deepEqual(roundtrip(h).paint, h.paint)
  })
for (const material of ['oak', 'walnut', 'tile'] as const)
  test(`restores partial ${material} grid in two independent rooms`, () => {
    const h = createHistory()
    for (const f of h.floors) {
      f.material = material
      f.laid = new Uint8Array(floorCells(f.room, material).length)
      f.laid.fill(1, 0, f.room === 'living' ? 12 : 4)
    }
    assert.deepEqual(roundtrip(h).floors, h.floors)
  })
test('restores completed floor and all installed cells under furniture', () => {
  const h = createHistory(),
    f = h.floors[0]
  f.material = 'tile'
  f.complete = true
  f.laid = new Uint8Array(floorCells('living', 'tile').length).fill(1)
  assert.deepEqual(roundtrip(h).floors, h.floors)
})
for (const action of ['undo', 'redo'] as const)
  test(`saves confirmed ${action} result without old history`, async () => {
    const s = new MemoryStorage(),
      q = new SaveQueue(s, 0)
    let h = historyReducer(createHistory(), { type: 'lamp', id: 'lamp' })
    h = historyReducer(h, { type: 'undo' })
    if (action === 'redo') h = historyReducer(h, { type: 'redo' })
    await q.write(captureWorld(h))
    const result = restoreWorld(s.record!.world)
    assert.deepEqual(result.present, h.present)
    assert.equal(result.past.length, 0)
  })
test('uncommitted private gesture leaves captured world unchanged', () => {
  const h = createHistory(),
    before = captureWorld(h),
    draft = h.dirt[0].mask.slice()
  draft.fill(0)
  assert.deepEqual(captureWorld(h), before)
})
for (const corrupt of [
  (w: WorldSave) => {
    w.items[0].x = NaN
  },
  (w: WorldSave) => {
    w.items[0].x = 20
  },
  (w: WorldSave) => {
    w.items[0].id = 'book'
  },
  (w: WorldSave) => {
    w.items[10].surfaceId = 'book'
  },
  (w: WorldSave) => {
    w.dirt[0].mask = new Uint8Array(3)
  },
  (w: WorldSave) => {
    w.paint[0].color = null
    w.paint[0].mask[0] = 255
  },
  (w: WorldSave) => {
    w.floors[0].complete = true
  },
  (w: WorldSave) => {
    w.disposed = ['unknown']
  },
])
  test('rejects corrupt state: ' + corrupt.toString().slice(0, 65), () => {
    const w = captureWorld(createHistory())
    corrupt(w)
    assert.throws(() => restoreWorld(w), /повреждено/)
  })
test('failed write retains last good world and does not report success', async () => {
  const s = new MemoryStorage(),
    q = new SaveQueue(s, 0)
  await q.write(captureWorld(createHistory()))
  const before = await s.read()
  s.fail = true
  await assert.rejects(q.write(null), /Quota/)
  assert.deepEqual(await s.read(), before)
  assert.equal(q.revision, 1)
})
test('reset deletes world, retains monotonic revision, and permits a new save', async () => {
  const s = new MemoryStorage(),
    q = new SaveQueue(s, 0)
  await q.write(captureWorld(createHistory()))
  await q.write(null, true)
  assert.equal(s.record?.world, null)
  assert.equal(s.record?.revision, 2)
  await q.write(captureWorld(createHistory()))
  assert.equal(s.record?.revision, 3)
})
test('rapid sequential writes retain newest state and monotonically advance revision', async () => {
  const s = new MemoryStorage(),
    q = new SaveQueue(s, 0)
  const jobs = Array.from({ length: 15 }, (_, i) => {
    const h = createHistory()
    h.present.find((x) => x.id === 'lamp')!.lampOn = i % 2 === 0
    return q.write(captureWorld(h))
  })
  await Promise.all(jobs)
  assert.equal(s.record?.revision, 15)
  assert.equal(
    restoreWorld(s.record?.world).present.find((i) => i.id === 'lamp')?.lampOn,
    true,
  )
})
test('second tab cannot overwrite or reset a newer world, including a reset tombstone', async () => {
  const s = new MemoryStorage(),
    a = new SaveQueue(s, 0),
    b = new SaveQueue(s, 0)
  await a.write(captureWorld(createHistory()))
  await assert.rejects(b.write(null), SaveConflict)
  await assert.rejects(b.write(null, true), SaveConflict)
  await a.write(null, true)
  assert.equal(s.record?.revision, 2)
})
