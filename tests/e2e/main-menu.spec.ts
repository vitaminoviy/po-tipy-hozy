import { test, expect } from '@playwright/test'

test('menu, decoration, panels, new game, persisted continue and reset confirmation', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const menu = page.getByRole('region', { name: 'Главное меню' })
  await expect(menu).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled()
  const start = page.getByRole('button', { name: 'New Game', exact: true })
  await expect(start).toBeEnabled()
  await page.locator('.title-content').evaluate(async (e) => {
    await Promise.all(e.getAnimations().map((a) => a.finished))
  })
  await expect(page.locator('.title-content')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await start.hover()
  await expect(start.locator('svg').first()).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'artifacts/menu/desktop.png' })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('checkbox').uncheck()
  await expect(menu).toHaveAttribute('data-motion', 'false')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Credits', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('vitaminoviy')
  await page.getByRole('button', { name: 'Back to menu' }).click()
  await page.getByRole('button', { name: 'Exit', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('закройте эту вкладку')
  await page.getByRole('button', { name: 'Back to menu' }).click()
  await start.click()
  await expect(menu).toHaveCount(0, { timeout: 15000 })
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByLabel('Меню дома').click()
  await expect(page.locator('.house-menu')).toHaveAttribute('open', '')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled()
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'New Game', exact: true }).click()
  await expect(menu).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(menu).toHaveCount(0, { timeout: 15000 })
  await page.reload()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'New Game', exact: true }).click()
  await expect(menu).toHaveCount(0, { timeout: 15000 })
  expect(errors).toEqual([])
})
for (const [width, height] of [
  [1920, 1080],
  [1280, 720],
  [800, 600],
  [390, 844],
]) {
  test(`menu fits ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: 'New Game', exact: true }),
    ).toBeEnabled()
    await page.locator('.title-content').evaluate(async (e) => {
      await Promise.all(e.getAnimations().map((a) => a.finished))
    })
    const box = (await page
      .getByRole('button', { name: 'Exit', exact: true })
      .boundingBox())!
    expect(box.y + box.height).toBeLessThan(height)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.screenshot({ path: `artifacts/menu/${width}.png` })
  })
}
test('reduced motion and slow GLB retain menu until scene readiness', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/models/sofa/*.glb', async (route) => {
    await held
    await route.continue()
  })
  try {
    await page.goto('/')
    expect(
      await page
        .locator('.menu-landscape')
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe('none')
    await page.getByRole('button', { name: 'New Game', exact: true }).click()
    await expect(page.getByText('Открываем ваш дом…')).toBeVisible()
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-furniture-assets',
      'loading',
    )
    release()
    await expect(page.locator('.main-menu')).toHaveCount(0, { timeout: 15000 })
  } finally {
    release()
  }
})

test('failed New Game preserves the existing save and Continue never overwrites it', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Game', exact: true }).click()
  await expect(page.locator('.main-menu')).toHaveCount(0, { timeout: 15000 })
  const read = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('quiet-home-progress')
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      const record = await new Promise<any>((resolve, reject) => {
        const r = db
          .transaction('progress')
          .objectStore('progress')
          .get('world')
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      db.close()
      return JSON.stringify(record)
    })
  const before = await read()
  await page.reload()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('.main-menu')).toHaveCount(0, { timeout: 15000 })
  expect(await read()).toBe(before)
  await page.reload()
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Test storage full', 'QuotaExceededError')
    }
  })
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'New Game', exact: true }).click()
  await expect(page.locator('.menu-error')).toContainText(
    'Не удалось начать игру',
  )
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled()
  await expect(page.locator('.main-menu')).toBeVisible()
  expect(await read()).toBe(before)
})
