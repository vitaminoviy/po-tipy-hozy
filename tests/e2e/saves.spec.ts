import { test, expect, chromium, type Page } from '@playwright/test'
import { world, clickWorld } from './support/world'
import { toolPositions, floorSamplePositions } from '../../src/workArea'
import { SAVE_DATABASE } from '../../src/saveStorage'
import { captureWorld } from '../../src/saveModel'
import { createHistory } from '../../src/history'
import { floorCells } from '../../src/flooring'

async function ready(page: Page) {
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
}
async function open(page: Page) {
  await page.goto('/')
  await ready(page)
}
async function menu(page: Page, open: boolean) {
  const el = page.locator('.house-menu')
  if (((await el.getAttribute('open')) !== null) !== open)
    await page.getByLabel('Меню дома').click()
}
async function command(page: Page, name: string) {
  await menu(page, true)
  await page.getByRole('button', { name, exact: true }).click({ timeout: 5000 })
}
async function tool(
  page: Page,
  name: keyof typeof toolPositions | keyof typeof floorSamplePositions,
) {
  await menu(page, false)
  const p =
    name in toolPositions
      ? toolPositions[name as keyof typeof toolPositions]
      : floorSamplePositions[name as keyof typeof floorSamplePositions]
  await clickWorld(page, p[0], p[1], p[2])
}
async function stroke(
  page: Page,
  a: [number, number, number],
  b: [number, number, number],
) {
  const p = await world(page, ...a),
    q = await world(page, ...b)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(q.x, q.y, { steps: 8 })
  await page.mouse.up()
}
async function saved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'data-status',
    'saved',
  )
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 1)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    return new Promise<any>((resolve, reject) => {
      const tx = db.transaction('progress'),
        r = tx.objectStore('progress').get('world')
      tx.oncomplete = () => {
        db.close()
        const record = r.result
        if (!record?.world) {
          resolve(record)
          return
        }
        const hash = (a: Uint8Array) => {
          let v = 2166136261
          for (const x of a) v = Math.imul(v ^ x, 16777619)
          return v >>> 0
        }
        resolve({
          revision: record.revision,
          world: {
            ...record.world,
            dirt: record.world.dirt.map((d: any) => ({
              id: d.id,
              hash: hash(d.mask),
              sum: d.mask.reduce((a: number, b: number) => a + b, 0),
            })),
            paint: record.world.paint.map((p: any) => ({
              id: p.id,
              color: p.color,
              hash: hash(p.mask),
              sum: p.mask.reduce((a: number, b: number) => a + b, 0),
            })),
            floors: record.world.floors.map((f: any) => ({
              ...f,
              laid: Array.from(f.laid),
            })),
          },
        })
      }
      tx.onerror = () => reject(tx.error)
    })
  }, SAVE_DATABASE)
}
async function settle(page: Page) {
  await page.keyboard.press('Escape')
  await menu(page, false)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(350)
}
async function visualDifference(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([a, b]) => {
      const images = await Promise.all(
        [a, b].map((data) =>
          createImageBitmap(
            new Blob([new Uint8Array(data)], { type: 'image/png' }),
          ),
        ),
      )
      const data = images.map((image) => {
        const c = new OffscreenCanvas(image.width, image.height),
          ctx = c.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        image.close()
        return ctx.getImageData(0, 0, c.width, c.height)
      })
      let sum = 0,
        count = 0
      // The contextual sentence at the top is transient, not saved world geometry.
      for (let i = data[0].width * 60 * 4; i < data[0].data.length; i += 4)
        for (let c = 0; c < 3; c++) {
          sum += Math.abs(data[0].data[i + c] - data[1].data[i + c])
          count++
        }
      return sum / count
    },
    [Array.from(a), Array.from(b)],
  )
}
test('confirmed world survives reload, reopening and four screen sizes; masks and visuals match', async ({
  page,
  context,
}) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await page.screenshot({ path: 'artifacts/08/before.png' })
  await command(page, 'Мягкое кресло')
  await command(page, 'Переместить')
  await menu(page, false)
  await page.keyboard.press('q')
  await page.waitForTimeout(180)
  let target = await world(page, -3.7, 0, 1.7)
  await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(60)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Установить/ })).toHaveCount(0)
  await command(page, 'Книга')
  await command(page, 'Взять предмет')
  await menu(page, false)
  target = await world(page, -3.05, 0.595, -0.55)
  await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(60)
  await page.keyboard.press('Enter')
  await command(page, 'Прикроватная тумба')
  await page.keyboard.press('e')
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  await settle(page)
  await page.keyboard.down('Shift')
  await clickWorld(page, -2.1, 0.04, 2.65)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('task-trash-living')).toContainText('1 / 5')
  await tool(page, 'sponge')
  await stroke(page, [-3.55, 0.019, 2.45], [-2.95, 0.019, 2.45])
  await tool(page, 'roller')
  await tool(page, 'sage')
  await stroke(page, [-4.902, 2.25, 1], [-4.902, 2.25, -1])
  await tool(page, 'oak')
  await stroke(page, [-1.8, 0.017, 1.9], [-0.5, 0.017, 1.9])
  await settle(page)
  const before = await saved(page)
  expect(
    before.world.items.find((i: any) => i.id === 'chair').rotation,
  ).not.toBe(1)
  expect(before.world.items.find((i: any) => i.id === 'book').surfaceId).toBe(
    'table',
  )
  expect(
    before.world.items.find((i: any) => i.id === 'nightstand').drawers[0],
  ).toBe(true)
  expect(before.world.items.find((i: any) => i.id === 'lamp').lampOn).toBe(true)
  expect(before.world.paint[0].sum).toBeGreaterThan(0)
  expect(before.world.floors[0].laid.some(Boolean)).toBe(true)
  const repaired = await page.screenshot({ path: 'artifacts/08/repaired.png' })
  await page.reload()
  await ready(page)
  await settle(page)
  expect(await saved(page)).toEqual(before)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const reloaded = await page.screenshot({ path: 'artifacts/08/reloaded.png' })
  expect(await visualDifference(page, repaired, reloaded)).toBeLessThan(0.25)
  await menu(page, true)
  // A new session intentionally has an empty undo stack.
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await menu(page, false)
  const next = await context.newPage()
  await page.close()
  await open(next)
  await settle(next)
  expect(await saved(next)).toEqual(before)
  const reopened = await next.screenshot({ path: 'artifacts/08/reopened.png' })
  expect(await visualDifference(next, repaired, reopened)).toBeLessThan(0.25)
  for (const [width, height] of [
    [1920, 1080],
    [1280, 720],
    [800, 600],
    [390, 844],
  ]) {
    await next.setViewportSize({ width, height })
    await next.reload()
    await ready(next)
    expect(await saved(next)).toEqual(before)
    expect(
      await next.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await next.screenshot({ path: `artifacts/08/restored-${width}.png` })
  }
  expect(errors).toEqual([])
})
test('undo/redo autosave and unfinished Esc gesture does not change the save', async ({
  page,
}) => {
  await open(page)
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  const on = await saved(page)
  await page.keyboard.press('Control+z')
  const off = await saved(page)
  expect(off.revision).toBe(on.revision + 1)
  await page.reload()
  await ready(page)
  expect(await saved(page)).toEqual(off)
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+y')
  const redo = await saved(page)
  await tool(page, 'oak')
  const p = await world(page, -3.6, 0.017, 2.65),
    q = await world(page, -2, 0.017, 2.65)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(q.x, q.y)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await saved(page)).toEqual(redo)
  await page.reload()
  await ready(page)
  expect(await saved(page)).toEqual(redo)
})
test('reset requires confirmation, cancelled reset leaves data; confirmed reset clears all world data', async ({
  page,
}) => {
  await open(page)
  await tool(page, 'tile')
  await stroke(page, [-3.6, 0.017, 2.65], [-2, 0.017, 2.65])
  const before = await saved(page)
  page.once('dialog', (d) => d.dismiss())
  await command(page, 'Начать заново')
  expect(await saved(page)).toEqual(before)
  page.once('dialog', (d) => d.accept())
  await command(page, 'Начать заново')
  await ready(page)
  expect((await saved(page)).world).toBeNull()
  await expect(page.getByTestId('task-replace-living')).toContainText('0%')
  await page.reload()
  await ready(page)
  await expect(page.getByTestId('task-replace-living')).toContainText('0%')
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  expect((await saved(page)).revision).toBe(before.revision + 2)
})
test('two tabs use atomic revision conflict detection and cannot silently overwrite', async ({
  page,
  context,
}) => {
  await open(page)
  const second = await context.newPage()
  await open(second)
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  const first = await saved(page)
  await command(second, 'Прикроватная тумба')
  await second.keyboard.press('e')
  await expect(second.getByRole('alert')).toContainText('другой вкладке')
  expect(await saved(page)).toEqual(first)
  second.once('dialog', (d) => d.accept())
  await command(second, 'Начать заново')
  await expect(second.getByRole('alert')).toContainText('Прогресс не удалён')
  expect(await saved(page)).toEqual(first)
  await second.reload()
  await ready(second)
  expect(await saved(second)).toEqual(first)
})
test('write failure preserves prior transaction and reset failure does not reset the house', async ({
  page,
}) => {
  await open(page)
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  const before = await saved(page)
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Тест: нет места', 'QuotaExceededError')
    }
  })
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  await expect(page.getByRole('alert')).toContainText(
    'Автосохранение остановлено',
  )
  page.once('dialog', (d) => d.accept())
  await command(page, 'Начать заново')
  await expect(page.getByRole('alert')).toContainText('Прогресс не удалён')
  await page.reload()
  await ready(page)
  expect(await saved(page)).toEqual(before)
})
for (const broken of ['schema', 'mask', 'revision', 'world'] as const)
  test(`invalid ${broken} is preserved until explicit reset`, async ({
    page,
  }) => {
    await open(page)
    await command(page, 'Торшер')
    await page.keyboard.press('e')
    await saved(page)
    await page.evaluate(
      async ({ name, broken }) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open(name)
          r.onsuccess = () => resolve(r.result)
        })
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('progress', 'readwrite'),
            store = tx.objectStore('progress'),
            r = store.get('world')
          r.onsuccess = () => {
            const rec = r.result
            if (broken === 'schema') rec.world.schemaVersion = 999
            else if (broken === 'revision') rec.revision = 'invalid'
            else if (broken === 'world') rec.world = false
            else rec.world.dirt[0].mask = new Uint8Array(2)
            store.put(rec, 'world')
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
        db.close()
      },
      { name: SAVE_DATABASE, broken },
    )
    await page.reload()
    await ready(page)
    await expect(page.getByRole('alert')).toContainText(
      broken === 'schema'
        ? 'Несовместимая'
        : broken === 'revision'
          ? 'Повреждена ревизия'
          : 'повреждено',
    )
    page.once('dialog', (d) => d.dismiss())
    await command(page, 'Начать заново')
    await expect(page.getByRole('alert')).toBeVisible()
    page.once('dialog', (d) => d.accept())
    await command(page, 'Начать заново')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect((await saved(page)).world).toBeNull()
  })
test('stored book and moved parent restore without duplicate objects', async ({
  page,
}) => {
  await open(page)
  await command(page, 'Прикроватная тумба')
  await page.keyboard.press('e')
  await command(page, 'Книга')
  await command(page, 'Взять предмет')
  await command(page, 'В ящик 1: Прикроватная тумба')
  await page.keyboard.press('Enter')
  await command(page, 'Прикроватная тумба')
  await page.keyboard.press('e')
  await command(page, 'Переместить')
  await menu(page, false)
  const p = await world(page, 1.05, 0, -2.2)
  await page.mouse.move(p.x, p.y)
  await page.waitForTimeout(50)
  await page.keyboard.press('Enter')
  const before = await saved(page)
  const book = before.world.items.find((i: any) => i.id === 'book')
  expect(book.surfaceId).toBe('nightstand')
  expect(book.drawerIndex).toBe(0)
  expect(
    before.world.items.find((i: any) => i.id === 'nightstand').z,
  ).toBeCloseTo(-2.2, 1)
  await page.reload()
  await ready(page)
  expect(await saved(page)).toEqual(before)
  await command(page, 'Книга')
  await expect(page.getByTestId('attachment')).toContainText('В ящике 1')
  await expect(page.locator('.item-list button')).toHaveCount(15)
  await command(page, 'Прикроватная тумба')
  await page.keyboard.press('e')
  await command(page, 'Книга')
  await command(page, 'Взять предмет')
  await expect(page.getByRole('button', { name: /^Установить/ })).toBeVisible()
})
test('unavailable IndexedDB shows a read error without claiming to save or delete', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException('Хранилище недоступно', 'SecurityError')
    }
  })
  await open(page)
  await expect(page.getByRole('alert')).toContainText('недоступно')
  await command(page, 'Торшер')
  await page.keyboard.press('e')
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'data-status',
    'error',
  )
  page.once('dialog', (d) => d.accept())
  await command(page, 'Начать заново')
  await expect(page.getByRole('alert')).toContainText('Прогресс не удалён')
})
test('actual browser restart retains IndexedDB in a separate persistent test profile', async ({
  baseURL,
}, info) => {
  test.setTimeout(60000)
  const profile = info.outputPath('isolated-profile')
  const options = {
    headless: true,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [],
    baseURL,
    viewport: { width: 1280, height: 720 },
  }
  let context = await chromium.launchPersistentContext(profile, options)
  let before: any
  let imageBefore: Buffer
  try {
    const page = context.pages()[0]
    await open(page)
    await command(page, 'Торшер')
    await page.keyboard.press('e')
    await tool(page, 'oak')
    await stroke(page, [-3.7, 0.017, 2.45], [-1.8, 0.017, 2.45])
    await tool(page, 'sponge')
    await stroke(page, [-3.55, 0.019, 2.45], [-2.9, 0.019, 2.45])
    await tool(page, 'roller')
    await stroke(page, [-4.902, 2.25, 1], [-4.902, 2.25, -1])
    await settle(page)
    before = await saved(page)
    expect(before.world.floors[0].material).toBe('oak')
    expect(before.world.paint[0].sum).toBeGreaterThan(0)
    imageBefore = await page.screenshot({
      path: 'artifacts/08/before-browser-restart.png',
    })
  } finally {
    await context.close()
  }
  context = await chromium.launchPersistentContext(profile, options)
  try {
    const page = context.pages()[0]
    await open(page)
    await settle(page)
    expect(await saved(page)).toEqual(before)
    const after = await page.screenshot({
      path: 'artifacts/08/browser-restarted.png',
    })
    expect(await visualDifference(page, imageBefore!, after)).toBeLessThan(0.25)
  } finally {
    await context.close()
  }
})
test('completed floors restore below rugs and furniture, with independent room materials', async ({
  page,
}) => {
  await open(page)
  const state = captureWorld(createHistory())
  for (const f of state.floors) {
    f.material = f.room === 'living' ? 'tile' : 'walnut'
    f.laid = new Uint8Array(floorCells(f.room, f.material).length).fill(1)
    f.complete = true
  }
  await page.evaluate(
    async ({ name, json }) => {
      const w = JSON.parse(json)
      for (const d of w.dirt)
        d.mask = new Uint8Array(Object.values(d.mask) as number[])
      for (const p of w.paint)
        p.mask = new Uint8Array(Object.values(p.mask) as number[])
      for (const f of w.floors)
        f.laid = new Uint8Array(Object.values(f.laid) as number[])
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => resolve(r.result)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('progress', 'readwrite')
        tx.objectStore('progress').put({ revision: 1, world: w }, 'world')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { name: SAVE_DATABASE, json: JSON.stringify(state) },
  )
  await page.reload()
  await ready(page)
  await expect(page.getByTestId('task-replace-living')).toContainText('100%')
  await expect(page.getByTestId('task-replace-bedroom')).toContainText('100%')
  const before = await saved(page)
  await page.screenshot({ path: 'artifacts/08/completed.png' })
  await page.reload()
  await ready(page)
  expect(await saved(page)).toEqual(before)
})
