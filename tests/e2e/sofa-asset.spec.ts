import { test, expect, type Page } from './support/legacy-test'
import { world, clickWorld } from './support/world'
import { captureWorld, restoreWorld } from '../../src/saveModel'
import { createHistory } from '../../src/history'
import { SAVE_DATABASE } from '../../src/saveStorage'

const ready = async (page: Page) => {
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-furniture-assets',
    'ready',
  )
}
const select = async (page: Page, name: string) => {
  if ((await page.locator('.house-menu').getAttribute('open')) === null)
    await page.getByLabel('Меню дома').click()
  await page
    .getByRole('button', { name, exact: name !== 'Скрыть стены' })
    .click()
}
async function seedLegacy(page: Page) {
  // These schema-1/history modules and IDs are unchanged from pre-GLB main.
  const history = createHistory()
  history.present = history.present.map((i) =>
    i.id === 'sofa'
      ? { ...i, rotation: 1 / 12, z: -2.3 }
      : i.id === 'book'
        ? { ...i, surfaceId: 'sofa', surfaceZone: 'seat-0.53', x: 0, z: 0 }
        : i,
  )
  const save = captureWorld(history)
  restoreWorld(save)
  await page.evaluate(
    async ({ json, name }) => {
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
        const t = db.transaction('progress', 'readwrite')
        t.objectStore('progress').put({ revision: 1, world: w }, 'world')
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
      })
      db.close()
    },
    { json: JSON.stringify(save), name: SAVE_DATABASE },
  )
  await page.reload()
  await ready(page)
}

for (const [width, height] of [
  [1920, 1080],
  [1280, 720],
  [800, 600],
  [390, 844],
])
  test(`Blender sofa loads with its texture at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    const errors: string[] = []
    let requests = 0
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => {
      if (r.url().includes('mint-sofa-v1.glb')) requests++
    })
    await page.goto('/')
    await ready(page)
    await page.locator('.house-menu').evaluate((m: HTMLDetailsElement) => {
      m.open = false
    })
    const point = await world(page, -2.27, 0.855, -2.42)
    expect(point.x).toBeGreaterThan(0)
    expect(point.x).toBeLessThan(width)
    expect(point.y).toBeGreaterThan(0)
    expect(point.y).toBeLessThan(height)
    await page.keyboard.press('Home')
    await page.getByRole('button', { name: 'Открыть записку' }).click()
    await page.getByRole('button', { name: 'Закрыть записку' }).click()
    await page.waitForTimeout(350)
    await page.screenshot({ path: `artifacts/visual114/viewport-${width}.png` })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    expect(requests).toBe(1)
    expect(errors).toEqual([])
  })

test('Blender sofa picks by mouse, moves and rotates with Q/R, undoes once and restores', async ({
  page,
}) => {
  const errors: string[] = []
  let requests = 0
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    if (r.url().includes('mint-sofa-v1.glb')) requests++
  })
  await page.goto('/')
  await ready(page)
  await select(page, 'Скрыть стены')
  const a = await world(page, -2.27, 0.855, -2.42)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.45 · 0°')
  await page.keyboard.down('q')
  const b = await world(page, -2.17, 0.855, -2.17)
  await page.mouse.move(b.x, b.y, { steps: 10 })
  await page.waitForTimeout(180)
  await page.keyboard.up('q')
  await page.mouse.up()
  const pose = await page.getByTestId('pose').innerText()
  expect(pose).not.toContain('0°')
  expect(pose).not.toContain('Z -2.45')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.45 · 0°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText(pose)
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'data-status',
    'saved',
  )
  await page.reload()
  await ready(page)
  await select(page, 'Диван «Мох»')
  await expect(page.getByTestId('pose')).toHaveText(pose)
  await select(page, 'Переместить')
  await page.keyboard.press('r')
  await page.waitForTimeout(200)
  expect(await page.getByTestId('pose').innerText()).not.toBe(pose)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pose')).toHaveText(pose)
  expect(requests).toBe(2)
  expect(errors).toEqual([])
})

test('pre-GLB schema-1 sofa pose and attached book restore, follow move/rotation and reload', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await seedLegacy(page)
  await select(page, 'Скрыть стены')
  await select(page, 'Диван «Мох»')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.30 · 7.5°')
  await select(page, 'Книга')
  await expect(page.getByTestId('attachment')).toHaveText('На: Диван «Мох»')
  const before = await page.getByTestId('pose').innerText()
  await select(page, 'Диван «Мох»')
  await select(page, 'Переместить')
  const p = await world(page, -2.7, 0, -2.05)
  await page.mouse.move(p.x, p.y)
  await page.keyboard.press('q')
  await page.waitForTimeout(180)
  await page.keyboard.press('Enter')
  await select(page, 'Книга')
  const after = await page.getByTestId('pose').innerText()
  expect(after).not.toBe(before)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText(before)
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText(after)
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'data-status',
    'saved',
  )
  await page.reload()
  await ready(page)
  await select(page, 'Книга')
  await expect(page.getByTestId('pose')).toHaveText(after)
  await expect(page.getByTestId('attachment')).toHaveText('На: Диван «Мох»')
  await expect(page.locator('.item-list button')).toHaveCount(15)
  await page.screenshot({ path: 'artifacts/visual114/attached-book.png' })
})

test('failed GLB uses a selectable fallback, then a fresh load recovers', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/models/sofa/mint-sofa-v1.glb', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-furniture-assets',
    'error',
  )
  await select(page, 'Скрыть стены')
  await clickWorld(page, -2.27, 0.855, -2.42)
  await expect(page.getByTestId('pose')).toContainText('X -2.80')
  await page.unroute('**/models/sofa/mint-sofa-v1.glb')
  await page.reload()
  await ready(page)
  expect(errors).toEqual([])
})

test('sofa keeps its seat anchors when the existing rug moves beneath its feet', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await select(page, 'Скрыть стены')
  await select(page, 'Перемещение')
  await select(page, 'Ковёр гостиной')
  await select(page, 'Переместить')
  const p = await world(page, -2.7, 0, -1.3)
  await page.mouse.move(p.x, p.y)
  await page.keyboard.press('Enter')
  await select(page, 'Диван «Мох»')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.45 · 0°')
  await page.locator('.house-menu').evaluate((m: HTMLDetailsElement) => {
    m.open = false
  })
  await page.screenshot({ path: 'artifacts/visual114/sofa-on-rug.png' })
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'data-status',
    'saved',
  )
  await page.reload()
  await ready(page)
  await select(page, 'Диван «Мох»')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.45 · 0°')
})
