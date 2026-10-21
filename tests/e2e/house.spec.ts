import { quarterTurn, buttonQuarterTurn } from './support/rotation'
import { test, expect, type Page } from './support/legacy-test'
import { OrthographicCamera, Vector3 } from 'three'

async function openHouse(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
}
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
  const state = JSON.parse(
    (await page.locator('canvas').getAttribute('data-camera'))!,
  )
  camera.position.fromArray(state.position)
  camera.lookAt(new Vector3().fromArray(state.target))
  camera.zoom = state.zoom
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
  await openHouse(page)
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await page.getByRole('button', { name: 'Диван «Мох»', exact: true }).click()
  await buttonQuarterTurn(page)
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -2.45 · 0°')
  await expect(page.locator('footer')).toContainText('поворот отменён')
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  await buttonQuarterTurn(page)
  await expect(page.getByTestId('pose')).toContainText('90°')
  await buttonQuarterTurn(page)
  await expect(page.getByTestId('pose')).toContainText('180°')
  await buttonQuarterTurn(page)
  await buttonQuarterTurn(page)
  await drag(page, [-2.8, 0.59, -0.4], 1.3, 0.4)
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('Предмет размещён')
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z 0.00 · 0°')
  await drag(page, [-1.5, 0.59, 0], 0, -1.25)
  const tooClose = await project(page, -1.5, 0.59, -1.46)
  await page.mouse.move(tooClose.x, tooClose.y)
  await expect(page.locator('footer')).toContainText('отступ 2 см')
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z -1.25 · 0°')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z 0.00 · 0°')
  await drag(page, [-1.5, 0.59, 0], 0, -2.5)
  await expect(page.locator('footer')).toContainText(
    'Здесь уже стоит другой предмет',
  )
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('последнюю допустимую')
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z -1.25 · 0°')
  await page.keyboard.press('Control+z')
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

test('rugs drag under furniture, rotate in preview and place through occluding meshes', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openHouse(page)
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await drag(page, [-3.7, 0.04, 0.4], 0.1, 0.25)
  await expect(
    page.getByRole('button', { name: 'Ковёр гостиной', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText('X -2.60 · Z 0.15 · 0°')
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  await page.getByRole('button', { name: 'Ковёр спальни', exact: true }).click()
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  await quarterTurn(page, 1)
  await expect(page.getByTestId('pose')).toContainText('90°')
  const target = await project(page, 2.5, 0, 0)
  await page.mouse.move(target.x, target.y)
  await expect(page.locator('footer')).toContainText('Можно разместить')
  await page.mouse.click(target.x, target.y)
  await expect(page.getByTestId('pose')).toHaveText('X 2.50 · Z 0.00 · 90°')
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  const bad = await project(page, 0, 0, 1)
  await page.mouse.move(bad.x, bad.y)
  await expect(page.locator('footer .invalid')).toBeVisible()
  await page.screenshot({ path: 'artifacts/invalid-rug-preview.png' })
  await page.mouse.click(bad.x, bad.y)
  await expect(
    page.getByRole('button', { name: 'Отменить', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Ковёр спальни', exact: true }).click()
  await expect(page.getByTestId('pose')).toHaveText('X 2.50 · Z 0.00 · 90°')
  await page
    .getByRole('button', { name: 'Кровать «Облако»', exact: true })
    .click()
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.65 · 0°')
  await drag(page, [2.8, 0.9, -1.65], 0, 0.25)
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.40 · 0°')
  await page.getByRole('button', { name: 'Показать стены' }).click()
  await page.screenshot({ path: 'artifacts/prototype-02.png' })
  expect(errors).toEqual([])
})

test('small motions keep the grab offset, and an invalid drag rolls back', async ({
  page,
}) => {
  await openHouse(page)
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  const start = await project(page, -2.8, 0.59, -0.4)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 1, start.y + 1)
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  await drag(page, [-2.8, 0.59, -0.4], 0.17, 0.09)
  await expect(page.getByTestId('pose')).toHaveText('X -2.63 · Z -0.31 · 0°')
  await quarterTurn(page, 1)
  await expect(page.getByTestId('pose')).toHaveText('X -2.63 · Z -0.31 · 90°')
  await page.mouse.up()
  await drag(page, [-2.63, 0.59, -0.31], 3, 0)
  await expect(page.locator('footer .invalid')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('последнюю допустимую')
  await expect(page.getByTestId('pose')).toHaveText('X -0.63 · Z -0.31 · 90°')
})
test('camera orbit, pan, zoom, reset and help', async ({ page }) => {
  await openHouse(page)
  await page.getByRole('button', { name: 'Управление' }).click()
  await expect(page.getByText('Осмотритесь и обустройтесь')).toBeVisible()
  await page.keyboard.press('Escape')
  const canvas = page.locator('canvas')
  await page.waitForTimeout(700)
  const capture = () =>
    canvas.screenshot({
      style:
        '.house-menu,.note-toggle,.tool-context,footer{visibility:hidden!important}',
    })
  const before = await capture()
  await page.mouse.move(950, 650)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1080, 620, { steps: 12 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(500)
  expect(await imageDifference(page, before, await capture())).toBeGreaterThan(
    0.001,
  )
  const orbit = await capture()
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1000, 650, { steps: 10 })
  await page.mouse.up({ button: 'right' })
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
test('preview crosses the old snap threshold continuously and stays still when the pointer stops', async ({
  page,
}) => {
  await openHouse(page)
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await drag(page, [-2.8, 0.59, -0.4], 1.32, 1.4)
  let previous = -Infinity
  const capture = () =>
    page.locator('canvas').screenshot({
      style:
        '.scene-heading,.view-tools,.room-labels,.selection{visibility:hidden!important}',
    })
  for (let i = 0; i <= 15; i++) {
    const point = await project(page, -1.48 + i * 0.004, 0.59, 1)
    await page.mouse.move(point.x, point.y)
    const text = await page.getByTestId('pose').innerText()
    const x = Number(text.match(/X (-?[\d.]+)/)![1])
    expect(x).toBeGreaterThanOrEqual(previous)
    if (Number.isFinite(previous))
      expect(x - previous).toBeLessThanOrEqual(0.01001)
    previous = x
    if ([0, 7, 15].includes(i))
      await page.screenshot({ path: `artifacts/stable-preview-${i}.png` })
  }
  const stopped = await capture()
  for (let i = 0; i < 3; i++)
    expect(await imageDifference(page, stopped, await capture())).toBe(0)
  // The old marker's blue-grey tint is absent around the original table footprint.
  const source = await project(page, -2.8, 0, -0.4)
  const crop = await page.screenshot({
    clip: { x: source.x - 50, y: source.y - 25, width: 100, height: 50 },
  })
  const bluePixels = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    )
    const canvas = new OffscreenCanvas(image.width, image.height),
      ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    image.close()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let blue = 0
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 2] > pixels[i + 1] + 5 && pixels[i + 1] > pixels[i] + 5)
        blue++
    return blue
  }, Array.from(crop))
  expect(bluePixels).toBe(0)
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('Предмет размещён')
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
  await openHouse(page)
  await expect(page.locator('canvas')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __tg: string[] }).__tg),
    )
    .toContain('ready')
  const bridgeCalls = await page.evaluate(
    () => (window as unknown as { __tg: string[] }).__tg.length,
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Кровать «Облако»', exact: true })
    .click()
  await expect(page.getByTestId('pose')).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as unknown as { __tg: string[] }).__tg.length,
    ),
  ).toBe(bridgeCalls)
  await page.screenshot({ path: 'artifacts/mobile.png' })
})
