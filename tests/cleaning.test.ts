import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bins,
  initialTrash,
  trashTypes,
  cleaningProgress,
  selectTrash,
  clearTrashSelection,
  disposeTrash,
  disposalFrame,
} from '../src/cleaning'
import { createHistory, historyReducer, type History } from '../src/history'
import {
  initialItems,
  validatePlacement,
  catalog,
  type Item,
} from '../src/placement'
import { floorSupport, FLOOR_TOP } from '../src/grounding'

function dispose(state: History, id: string, binId = bins[0].id) {
  return historyReducer(historyReducer(state, { type: 'trash-select', id }), {
    type: 'trash-dispose',
    id,
    binId,
  })
}
test('nine stable trash IDs cover four types and correct rooms, separate from decor', () => {
  assert.equal(initialTrash.length, 9)
  assert.equal(new Set(initialTrash.map((t) => t.id)).size, 9)
  assert.equal(new Set(initialTrash.map((t) => t.kind)).size, 4)
  assert.deepEqual(cleaningProgress(initialTrash, 'living'), {
    disposed: 0,
    total: 5,
  })
  assert.deepEqual(cleaningProgress(initialTrash, 'bedroom'), {
    disposed: 0,
    total: 4,
  })
  assert.ok(
    initialTrash.every(
      (t) => t.state === 'room' && (t.room === 'living' ? t.x < 0 : t.x > 0),
    ),
  )
  assert.ok(initialItems.every((i) => !initialTrash.some((t) => t.id === i.id)))
  assert.equal(
    initialItems.filter((i) => catalog[i.kind].category === 'surfaceDecor')
      .length,
    3,
  )
})
test('initial trash and bins have floor support and do not overlap initial furniture or room boundaries', () => {
  for (const t of initialTrash) {
    const probe: Item = { ...t, kind: 'box', rotation: 0 }
    assert.equal(validatePlacement(probe, initialItems), null, t.id)
    const [w, , d] = trashTypes[t.kind].size
    assert.ok(floorSupport({ ...t, w, d }, initialItems) >= FLOOR_TOP)
    assert.equal(floorSupport({ ...t, w, d }, []), FLOOR_TOP)
  }
  for (const b of bins) {
    assert.ok(Math.abs(b.x) + 0.236 < 4.88)
    assert.ok(Math.abs(b.z) + 0.236 < 3.38)
  }
  const rug = initialItems.find((i) => i.kind === 'bedroomRug')!
  assert.ok(
    floorSupport({ x: rug.x, z: rug.z, w: 0.22, d: 0.22 }, initialItems) >
      FLOOR_TOP,
  )
})
test('selection is exclusive, cancel preserves all trash, disposed and unknown IDs cannot be picked', () => {
  let trash = selectTrash(initialTrash, initialTrash[0].id)
  assert.equal(trash.filter((t) => t.state === 'selected').length, 1)
  trash = selectTrash(trash, initialTrash[1].id)
  assert.equal(trash[0].state, 'room')
  assert.equal(trash[1].state, 'selected')
  assert.deepEqual(clearTrashSelection(trash), initialTrash)
  assert.equal(selectTrash(trash, 'book'), trash)
  trash = disposeTrash(trash, initialTrash[1].id, bins[0].id)
  assert.equal(selectTrash(trash, initialTrash[1].id), trash)
  assert.equal(initialTrash[1].state, 'room')
})
test('only selected trash and a registered bin can dispose; duplicate disposal is a no-op', () => {
  const initial = createHistory()
  assert.equal(
    historyReducer(initial, {
      type: 'trash-dispose',
      id: 'trash-l1',
      binId: bins[0].id,
    }),
    initial,
  )
  const selected = historyReducer(initial, {
    type: 'trash-select',
    id: 'trash-l1',
  })
  assert.equal(selected.past.length, 0)
  assert.equal(
    historyReducer(selected, {
      type: 'trash-dispose',
      id: 'trash-l1',
      binId: 'table',
    }),
    selected,
  )
  const done = historyReducer(selected, {
    type: 'trash-dispose',
    id: 'trash-l1',
    binId: bins[1].id,
  })
  assert.equal(done.past.length, 1)
  assert.equal(cleaningProgress(done.trash, 'living').disposed, 1)
  assert.equal(
    historyReducer(done, {
      type: 'trash-dispose',
      id: 'trash-l1',
      binId: bins[0].id,
    }),
    done,
  )
  assert.equal(
    historyReducer(done, {
      type: 'trash-dispose',
      id: 'cup',
      binId: bins[0].id,
    }),
    done,
  )
  assert.deepEqual(done.present, initial.present)
})
test('progress is derived per source room even when using the other bin, and completes only at the last item', () => {
  let state = createHistory()
  for (const [index, t] of initialTrash
    .filter((t) => t.room === 'living')
    .entries()) {
    state = dispose(state, t.id, bins[1].id)
    assert.deepEqual(cleaningProgress(state.trash, 'living'), {
      disposed: index + 1,
      total: 5,
    })
    assert.equal(cleaningProgress(state.trash, 'bedroom').disposed, 0)
  }
  for (const t of initialTrash.filter((t) => t.room === 'bedroom'))
    state = dispose(state, t.id)
  assert.equal(cleaningProgress(state.trash, 'bedroom').disposed, 4)
  assert.ok(state.trash.every((t) => t.state === 'disposed'))
})
test('disposal undo and redo restore identity and floor coordinates with no stale selection', () => {
  const initial = createHistory(),
    done = dispose(initial, 'trash-l1')
  const undone = historyReducer(done, { type: 'undo' })
  assert.deepEqual(undone.trash, initial.trash)
  const repeated = historyReducer(undone, { type: 'redo' })
  assert.deepEqual(repeated.trash, done.trash)
  assert.equal(repeated.trash.length, 9)
  assert.equal(new Set(repeated.trash.map((t) => t.id)).size, 9)
})
test('one shared history orders furniture and cleanup, and a new action clears redo', () => {
  const start = createHistory(),
    cleaned = dispose(start, 'trash-b1')
  const lamp = historyReducer(cleaned, { type: 'lamp', id: 'lamp' })
  const undoLamp = historyReducer(lamp, { type: 'undo' })
  assert.deepEqual(undoLamp.present, cleaned.present)
  assert.deepEqual(undoLamp.trash, cleaned.trash)
  const undoTrash = historyReducer(undoLamp, { type: 'undo' })
  assert.deepEqual(undoTrash.trash, start.trash)
  const branch = dispose(undoTrash, 'trash-l1')
  assert.equal(branch.future.length, 0)
  assert.deepEqual(historyReducer(branch, { type: 'redo' }), branch)
  assert.equal(start.trash[5].state, 'room')
})
test('selection and cancellation never create history entries or erase redo', () => {
  let state = historyReducer(dispose(createHistory(), 'trash-l1'), {
    type: 'undo',
  })
  state = historyReducer(state, { type: 'trash-select', id: 'trash-b1' })
  state = historyReducer(state, { type: 'trash-cancel' })
  assert.equal(state.past.length, 0)
  assert.equal(state.future.length, 1)
  assert.ok(state.trash.every((t) => t.state === 'room'))
})
test('disposal pose shrinks monotonically and is bounded even after an interrupted long frame', () => {
  let previous = 1
  for (let n = 0; n <= 100; n++) {
    const frame = disposalFrame(initialTrash[0], bins[0], n / 100)
    assert.ok(frame.scale <= previous && frame.scale >= 0)
    assert.ok(frame.lift >= 0 && frame.lift <= 0.15)
    assert.ok(
      Math.hypot(frame.x - initialTrash[0].x, frame.z - initialTrash[0].z) <=
        0.550001,
    )
    previous = frame.scale
  }
  assert.equal(disposalFrame(initialTrash[0], bins[0], -1).scale, 1)
  assert.equal(disposalFrame(initialTrash[0], bins[0], 100).scale, 0)
})
test('bins reject floor furniture and decor overlaps but allow rugs; fresh sessions reset cleanup', () => {
  for (const kind of ['chair', 'cup', 'book', 'box'] as const)
    assert.match(
      validatePlacement(
        { ...bins[1], id: 'probe', kind, x: 4.3, rotation: 0 },
        [],
      )!,
      /ведро/,
    )
  assert.equal(
    validatePlacement(
      { id: 'rug', kind: 'rug', x: -3.1, z: 1.5, rotation: 0 },
      [],
    ),
    null,
  )
  dispose(createHistory(), 'trash-l1')
  assert.deepEqual(createHistory().trash, initialTrash)
})
