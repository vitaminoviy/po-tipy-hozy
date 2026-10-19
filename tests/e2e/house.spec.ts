import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

async function project(page: Page, x: number, y: number, z: number) {
  const box = (await page.locator('canvas').boundingBox())!
  const camera = new OrthographicCamera(
    -box.width / 2,
    box.width / 2,
    box.height / 2,
    -box.height / 2,
    0.1,
    250,
  )
  camera.position.set(12, 11, 15)
  camera.lookAt(0, 0, 0)
  camera.zoom = Math.min(46, box.width / 14, box.height / 10)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(camera)
  return {
    x: box.x + ((p.x + 1) * box.width) / 2,
    y: box.y + ((1 - p.y) * box.height) / 2,
  }
}
async function drag(
  page: Page,
  from: [number, number, number],
  dx: number,
  dz: number,
) {
  const start = await project(page, ...from)
  const end = await project(page, from[0] + dx, from[1], from[2] + dz)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
}
async function imageDifference(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([first, second]) => {
      const images = await Promise.all(
        [first, second].map((bytes) =>
          createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          ),
        ),
      )
      const pixels = images.map((image) => {
        const canvas = new OffscreenCanvas(image.width, image.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        return ctx.getImageData(0, 0, image.width, image.height).data
      })
      let changed = 0
      for (let i = 0; i < pixels[0].length; i += 4)
        if (
          Math.max(
            ...[0, 1, 2].map((c) =>
              Math.abs(pixels[0][i + c] - pixels[1][i + c]),
            ),
          ) > 12
        )
          changed++
      images.forEach((image) => image.close())
      return changed / (pixels[0].length / 4)
    },
    [Array.from(a), Array.from(b)],
  )
}
test('furniture selection, rotation, drag, collision rollback and cancel', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await page.getByRole('button', { name: 'Диван «Мох»', exact: true }).click()
  await page.getByRole('button', { name: /Повернуть/ }).click()
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.45 · 0°')
  await expect(page.locator('footer')).toContainText('поворот отменён')
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  await page.getByRole('button', { name: /Повернуть/ }).click()
  await expect(page.getByTestId('pose')).toContainText('90°')
  await page.keyboard.press('r')
  await expect(page.getByTestId('pose')).toContainText('180°')
  await page.keyboard.press('r')
  await page.keyboard.press('r')
  await drag(page, [-2.8, 0.59, -0.4], 1.25, 0.5)
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('Предмет размещён')
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z 0.00 · 0°')
  await drag(page, [-1.5, 0.59, 0], 0, -2.5)
  await expect(page.locator('footer')).toContainText(
    'Здесь уже стоит другой предмет',
  )
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('возвращён на место')
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z 0.00 · 0°')
  await drag(page, [-1.5, 0.59, 0], -1, 1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z 0.00 · 0°')
  await drag(page, [-1.5, 0.59, 0], 3.25, 1.25)
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText('X 1.75 · Z 1.25 · 0°')
  await expect(
    page.getByRole('button', { name: 'Журнальный стол', exact: true }),
  ).toContainText('Спальня')
  await page.getByRole('button', { name: 'Показать стены' }).click()
  await page.screenshot({ path: 'artifacts/desktop.png' })
  expect(errors).toEqual([])
})
test('camera orbit, pan, zoom, reset and help', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Управление' }).click()
  await expect(page.getByText('Осмотритесь и обустройтесь')).toBeVisible()
  await page.keyboard.press('Escape')
  const canvas = page.locator('canvas')
  await page.waitForTimeout(700)
  const capture = () =>
    canvas.screenshot({
      style:
        '.scene-heading,.view-tools,.room-labels,.selection{visibility:hidden!important}',
    })
  const before = await capture()
  await page.mouse.move(950, 650)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1080, 620, { steps: 12 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(500)
  expect(await imageDifference(page, before, await capture())).toBeGreaterThan(
    0.001,
  )
  const orbit = await capture()
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1000, 650, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(500)
  expect(await imageDifference(page, orbit, await capture())).toBeGreaterThan(
    0.001,
  )
  const pan = await capture()
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(500)
  expect(await imageDifference(page, pan, await capture())).toBeGreaterThan(
    0.001,
  )
  await page.getByRole('button', { name: 'Вернуть камеру' }).click()
  await page.waitForTimeout(500)
  expect(await imageDifference(page, before, await capture())).toBeLessThan(
    0.001,
  )
})
test('narrow viewport and Telegram bridge initialize without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.__tg=[];window.Telegram={WebApp:{ready(){window.__tg.push("ready")},expand(){window.__tg.push("expand")},disableVerticalSwipes(){window.__tg.push("swipes")}}}',
    }),
  )
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __tg: string[] }).__tg),
    )
    .toContain('ready')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Кровать «Облако»', exact: true })
    .click()
  await expect(page.getByTestId('pose')).toBeVisible()
  await page.screenshot({ path: 'artifacts/mobile.png' })
})
