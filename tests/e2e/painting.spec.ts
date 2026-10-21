import { test, expect, type Page } from './support/legacy-test'
import { world, clickWorld } from './support/world'
import { paintWalls, wallWorld, type PaintWall } from '../../src/painting'
async function open(page: Page, hidden = false) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  if (hidden) await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.waitForTimeout(120)
}
async function move(page: Page, w: PaintWall, u: number, v: number, steps = 1) {
  const p = wallWorld(w, { x: u, y: v })
  const s = await world(page, p.x, p.y, p.z)
  await page.mouse.move(s.x, s.y, { steps })
}
async function stroke(page: Page, w: PaintWall, v: number) {
  await move(page, w, -w.w * 0.43, v)
  await page.mouse.down()
  await move(page, w, w.w * 0.43, v, 8)
  await page.mouse.up()
}
const percent = async (page: Page) =>
  Number(
    (await page.getByTestId('paint-progress').textContent())!.replace('%', ''),
  )
test('fast vertical and diagonal motion stays local; windows are not painting targets', async ({
  page,
}) => {
  await open(page)
  const w = paintWalls[0]
  await move(page, w, -1, 0.3)
  await page.mouse.down()
  await move(page, w, -1, 1.1)
  await page.mouse.up()
  const v = await percent(page)
  expect(v).toBeGreaterThan(0)
  expect(v).toBeLessThan(15)
  const diagonal = async () => {
    await move(page, w, -1, 0.3)
    await page.mouse.down()
    await move(page, w, 1, 1.1)
    await page.mouse.up()
  }
  await diagonal()
  const first = await percent(page)
  expect(first).toBeGreaterThan(v)
  await diagonal()
  expect(await percent(page)).toBe(first)
  await clickWorld(page, -2.5, 1.8, -3.38)
  await move(page, w, 0, 0.7)
  expect(await percent(page)).toBe(first)
})
for (const index of [0, 1])
  test(
    'full wall ' +
      index +
      ' keeps visibly partial strokes beyond the old rectangle',
    async ({ page }) => {
      await open(page)
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      const w = paintWalls[index]
      await page
        .getByRole('button', {
          name: index ? 'Терракотовый' : 'Шалфейный',
          exact: true,
        })
        .click()
      await move(page, w, 0, 0.7)
      await page.screenshot({
        path: 'artifacts/real-wall-' + index + '-before.png',
      })
      await stroke(page, w, 0.7)
      const f = await percent(page)
      expect(f).toBeGreaterThan(0)
      expect(f).toBeLessThan(20)
      await page.mouse.move(25, 80)
      await page.screenshot({
        path: 'artifacts/real-wall-' + index + '-one.png',
      })
      await stroke(page, w, 0.7)
      expect(await percent(page)).toBe(f)
      for (const y of [0.2, 0.4, 0.9, 1.1, 1.3]) await stroke(page, w, y)
      const partial = await percent(page)
      expect(partial).toBeGreaterThan(f)
      expect(partial).toBeLessThan(90)
      await page.mouse.move(25, 80)
      await page.screenshot({
        path: 'artifacts/real-wall-' + index + '-partial.png',
      })
      await page.keyboard.press('Control+z')
      expect(await percent(page)).toBeLessThan(partial)
      await page.keyboard.press('Control+y')
      expect(await percent(page)).toBe(partial)
      expect(errors).toEqual([])
    },
  )
test('three gestures undo separately, lock color, survive tool changes and reset on reload', async ({
  page,
}) => {
  await open(page)
  const w = paintWalls[0]
  for (const y of [0.3, 0.7, 1.1]) await stroke(page, w, y)
  const three = await percent(page)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z')
  expect(await percent(page)).toBe(0)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+y')
  expect(await percent(page)).toBe(three)
  await page.getByRole('button', { name: 'Кремовый', exact: true }).click()
  await stroke(page, w, 0.5)
  await expect(page.locator('footer')).toContainText('Цвет стены закреплён')
  expect(await percent(page)).toBe(three)
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await move(page, w, 0, 0.7)
  expect(await percent(page)).toBe(three)
  await open(page)
  await move(page, w, 0, 0.7)
  expect(await percent(page)).toBe(0)
})
test('exit and re-entry break the gesture, without bridging unvisited wall areas', async ({
  page,
}) => {
  await open(page)
  const w = paintWalls[0]
  await page.mouse.move(30, 950)
  const before = await page.screenshot()
  await move(page, w, -2, 0.4)
  await page.mouse.down()
  await move(page, w, -1.8, 0.4)
  await move(page, w, 0, 3)
  await move(page, w, 1.8, 0.9)
  await move(page, w, 2, 0.9)
  await page.mouse.up()
  expect(await percent(page)).toBeGreaterThan(0)
  expect(await percent(page)).toBeLessThan(15)
  await page.mouse.move(30, 950)
  const after = await page.screenshot({
    path: 'artifacts/real-wall-disconnected.png',
  })
  const points = await Promise.all(
    [
      { x: 0, y: 0.7 },
      { x: -1.9, y: 0.4 },
    ].map(async (p) => {
      const v = wallWorld(w, p)
      return world(page, v.x, v.y, v.z)
    }),
  )
  const differences = await page.evaluate(
    async ({ a, b, points }) => {
      const pixels = await Promise.all(
        [a, b].map(async (bytes) => {
          const image = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          )
          const canvas = new OffscreenCanvas(image.width, image.height)
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(image, 0, 0)
          image.close()
          return points.map((p) =>
            Array.from(
              ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data,
            ).slice(0, 3),
          )
        }),
      )
      return points.map((_, i) =>
        Math.max(...pixels[0][i].map((v, c) => Math.abs(v - pixels[1][i][c]))),
      )
    },
    { a: [...before], b: [...after], points },
  )
  expect(differences[0]).toBeLessThanOrEqual(2)
  expect(differences[1]).toBeGreaterThan(8)
  await page.keyboard.press('Control+z')
  expect(await percent(page)).toBe(0)
})
test('two wall colors survive trash, floor wiping and independent undo actions', async ({
  page,
}) => {
  await open(page)
  await stroke(page, paintWalls[0], 0.7)
  const a = await percent(page)
  await page.getByRole('button', { name: 'Терракотовый', exact: true }).click()
  await stroke(page, paintWalls[1], 0.7)
  const b = await percent(page)
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  const trash = await world(page, -4.45, 0.12, -1.3)
  await page.keyboard.down('Shift')
  await page.mouse.click(trash.x, trash.y)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('cleaning-living')).toContainText('1 / 5')
  const from = await world(page, -3.55, 0.019, 2.45),
    to = await world(page, -2.75, 0.019, 2.45)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('floor-living')).not.toHaveText('0%')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('floor-living')).toHaveText('0%')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('cleaning-living')).toContainText('0 / 5')
  await page.getByRole('button', { name: 'Показать стены' }).click()
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await move(page, paintWalls[0], 0, 0.7)
  expect(await percent(page)).toBe(a)
  await move(page, paintWalls[1], 0, 0.7)
  expect(await percent(page)).toBe(b)
})
test('tool, palette and visibility changes synchronously cancel a held private stroke', async ({
  page,
}) => {
  await open(page)
  const w = paintWalls[0]
  for (const name of ['Покраска', 'Кремовый', 'Скрыть стены']) {
    await move(page, w, -1, 0.7)
    await page.mouse.down()
    await move(page, w, 1, 0.7, 8)
    expect(await percent(page)).toBeGreaterThan(0)
    await page
      .getByRole('button', { name, exact: name !== 'Скрыть стены' })
      .evaluate((b: HTMLButtonElement) => b.click())
    await page.mouse.up()
    if (name === 'Покраска')
      await page.getByRole('button', { name, exact: true }).click()
    if (name === 'Скрыть стены')
      await page.getByRole('button', { name: 'Показать стены' }).click()
    await move(page, w, 0, 0.7)
    expect(await percent(page)).toBe(0)
  }
  await stroke(page, w, 0.7)
  expect(await percent(page)).toBeGreaterThan(0)
})
test('Esc, blur, mode changes and release outside never leave stuck paint input', async ({
  page,
}) => {
  await open(page)
  const w = paintWalls[0]
  for (const cancel of ['Escape', 'blur', 'Tab']) {
    await move(page, w, -1, 0.7)
    await page.mouse.down()
    await move(page, w, 1, 0.7, 8)
    expect(await percent(page)).toBeGreaterThan(0)
    if (cancel === 'blur')
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else await page.keyboard.press(cancel)
    await page.mouse.up()
    if (cancel === 'Escape')
      await page.getByRole('button', { name: 'Покраска', exact: true }).click()
    if (cancel === 'Tab') {
      await page.keyboard.press('Tab')
      await page.getByRole('button', { name: 'Покраска', exact: true }).click()
    }
    await move(page, w, 0, 0.7)
    expect(await percent(page)).toBe(0)
  }
  await move(page, w, -1, 0.7)
  await page.mouse.down()
  await move(page, w, 0.3, 0.7)
  await page.mouse.move(30, 950)
  await page.mouse.up()
  await move(page, w, 0, 0.7)
  const stopped = await percent(page)
  expect(stopped).toBeGreaterThan(0)
  await move(page, w, 1, 1)
  expect(await percent(page)).toBe(stopped)
})
test('hidden walls do not intercept; camera mapping persists and ordinary interaction recovers', async ({
  page,
}) => {
  await open(page, true)
  const w = paintWalls[1]
  await stroke(page, w, 0.7)
  const before = await percent(page)
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await stroke(page, w, 0.3)
  expect(await percent(page)).toBe(before)
  await page.getByRole('button', { name: 'Показать стены' }).click()
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.width / 2, box.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.width / 2 + 25, box.height / 2 + 10, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(400)
  await move(page, w, 0, 0.7)
  expect(await percent(page)).toBe(before)
  await stroke(page, w, 0.3)
  expect(await percent(page)).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.getByRole('button', { name: 'Торшер', exact: true }).click()
  await page.keyboard.press('e')
  await expect(
    page.getByRole('button', { name: 'Выключить торшер', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Tab')
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  await page.keyboard.press('r')
  await expect(page.getByTestId('pose')).toContainText('352.5°')
})
