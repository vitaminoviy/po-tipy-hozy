import { test, expect, type Page } from '@playwright/test'
import { world, clickWorld } from './support/world'
import { toolPositions, floorSamplePositions } from '../../src/workArea'
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
}
const camera = async (page: Page) =>
  JSON.parse((await page.locator('canvas').getAttribute('data-camera'))!)
    .target as number[]
for (const [width, height] of [
  [1920, 1080],
  [1600, 900],
  [1280, 720],
  [800, 600],
  [390, 844],
  [360, 800],
])
  test(
    'responsive controls, samples and orientation ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page)
      for (const [id, p] of [
        ...Object.entries(toolPositions),
        ...Object.entries(floorSamplePositions),
      ]) {
        const s = await world(page, p[0], p[1], p[2])
        expect(s.x).toBeGreaterThan(3)
        expect(s.x).toBeLessThan(width - 3)
        expect(s.y).toBeGreaterThan(3)
        expect(s.y).toBeLessThan(height - 3)
        if (['cream', 'sage', 'terracotta'].includes(id))
          await clickWorld(page, ...toolPositions.roller)
        await clickWorld(page, p[0], p[1], p[2])
        await expect(
          page.locator('.tool-context').filter({ visible: true }),
        ).toHaveCount(1)
        await page.keyboard.press('Escape')
      }
      await page.getByRole('button', { name: 'Открыть записку' }).click()
      await expect(page.locator('.owner-note')).toHaveClass(/open/)
      await page.getByRole('button', { name: 'Закрыть записку' }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `artifacts/09/viewport-${width}.png` })
      await page.setViewportSize({ width: height, height: width })
      await page.waitForTimeout(200)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(height)
      const s = await world(page, ...floorSamplePositions.oak)
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(height)
    },
  )
test('Telegram mock stable viewport, safe areas and deactivation cancel repair without touching the save', async ({
  page,
}) => {
  await page.route('https://telegram.org/js/telegram-web-app.js', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `const callbacks={};window.__emit=(name,data)=>{for(const f of callbacks[name]||[])f(data)};window.Telegram={WebApp:{viewportStableHeight:650,safeAreaInset:{top:30},contentSafeAreaInset:{top:20,right:12},isVersionAtLeast:()=>true,ready(){},expand(){},disableVerticalSwipes(){},onEvent(n,f){(callbacks[n]??=[]).push(f)},offEvent(n,f){callbacks[n]=callbacks[n].filter(x=>x!==f)}}}`,
    }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  expect((await page.locator('canvas').boundingBox())!.height).toBe(650)
  expect(
    (await page.locator('.house-menu').boundingBox())!.y,
  ).toBeGreaterThanOrEqual(42)
  await page.evaluate(() => {
    window.Telegram!.WebApp!.viewportStableHeight = 700
    ;(window as any).__emit('viewportChanged', { isStateStable: true })
  })
  await expect
    .poll(async () => (await page.locator('canvas').boundingBox())!.height)
    .toBe(700)
  const p = floorSamplePositions.oak
  await clickWorld(page, ...p)
  const a = await world(page, -3.6, 0.017, 2.45),
    b = await world(page, -2, 0.017, 2.45)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.evaluate(() => (window as any).__emit('deactivated'))
  await page.mouse.up()
  await expect(page.getByTestId('task-replace-living')).toContainText('0%')
  await page.reload()
  await expect(page.getByTestId('task-replace-living')).toContainText('0%')
})
test('WebGL context restoration retains saved repair and cancels input', async ({
  page,
}) => {
  await open(page)
  const p = floorSamplePositions.oak
  await clickWorld(page, ...p)
  const a = await world(page, -3.6, 0.017, 2.45),
    b = await world(page, -2, 0.017, 2.45)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.up()
  const before = await page.locator('canvas').getAttribute('data-flooring')
  await page.mouse.move(2, 2)
  await page.waitForTimeout(200)
  const imageBefore = await page.screenshot({
    path: 'artifacts/09/context-before.png',
  })
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_lose_context')
    if (!ext) throw new Error('Required test extension unavailable')
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), 150)
  })
  await page.waitForTimeout(700)
  expect(await page.locator('canvas').getAttribute('data-flooring')).toBe(
    before,
  )
  const imageAfter = await page.screenshot({
    path: 'artifacts/09/context-after.png',
  })
  const difference = await page.evaluate(
    async ([a, b]) => {
      const images = await Promise.all(
        [a, b].map((v) =>
          createImageBitmap(
            new Blob([new Uint8Array(v)], { type: 'image/png' }),
          ),
        ),
      )
      const data = images.map((img) => {
        const c = new OffscreenCanvas(img.width, img.height),
          ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        img.close()
        return ctx.getImageData(0, 0, c.width, c.height)
      })
      let sum = 0,
        count = 0
      for (let i = data[0].width * 60 * 4; i < data[0].data.length; i += 4)
        for (let j = 0; j < 3; j++) {
          sum += Math.abs(data[0].data[i + j] - data[1].data[i + j])
          count++
        }
      return sum / count
    },
    [Array.from(imageBefore), Array.from(imageAfter)],
  )
  expect(difference).toBeLessThan(1)
  await page.keyboard.press('Escape')
  await page.reload()
  await open(page)
  expect(await page.locator('canvas').getAttribute('data-flooring')).toBe(
    before,
  )
})
test('visibility change cancels held camera keys without relying on a native blur', async ({
  page,
}) => {
  await open(page)
  await page.keyboard.down('w')
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const before = await camera(page)
  await page.waitForTimeout(200)
  const after = await camera(page)
  expect(Math.hypot(...after.map((n, i) => n - before[i]))).toBeLessThan(0.001)
  await page.keyboard.up('w')
})
test('repeated confirmed new games release detached DOM and event listeners', async ({
  page,
  context,
}) => {
  test.setTimeout(60000)
  await open(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  const reset = async () => {
    await page.getByLabel('Меню дома').click()
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Начать заново', exact: true })
      .click()
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-scene-ready',
      'true',
    )
    await page.waitForTimeout(1200)
    await cdp.send('HeapProfiler.collectGarbage')
  }
  await reset()
  const before = await cdp.send('Memory.getDOMCounters')
  for (let i = 0; i < 6; i++) await reset()
  const after = await cdp.send('Memory.getDOMCounters')
  expect(after.jsEventListeners).toBeLessThanOrEqual(
    before.jsEventListeners + 5,
  )
  expect(after.nodes).toBeLessThanOrEqual(before.nodes + 30)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
