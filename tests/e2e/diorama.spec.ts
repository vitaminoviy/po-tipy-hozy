import { test, expect, type Page } from '@playwright/test'
import { world, clickWorld } from './support/world'
import { toolPositions } from '../../src/WorkTools'
import { paintWalls, wallWorld, type PaintWall } from '../../src/painting'
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
}
async function tool(page: Page, id: keyof typeof toolPositions) {
  await clickWorld(
    page,
    toolPositions[id][0],
    toolPositions[id][1],
    toolPositions[id][2],
  )
  await page.waitForTimeout(120)
}
async function move(page: Page, w: PaintWall, u: number, v: number) {
  const p = wallWorld(w, { x: u, y: v })
  const s = await world(page, p.x, p.y, p.z)
  await page.mouse.move(s.x, s.y)
}
async function stroke(
  page: Page,
  w: PaintWall,
  v: number,
  left = -w.w * 0.47,
  right = w.w * 0.47,
) {
  await move(page, w, left, v)
  await page.mouse.down()
  await move(page, w, right, v)
  await page.mouse.up()
}
const percent = async (page: Page) =>
  Number(
    (await page.getByTestId('active-tool-progress').textContent())?.replace(
      '%',
      '',
    ),
  )
for (const [width, height] of [
  [1920, 1080],
  [1280, 720],
  [800, 600],
  [390, 844],
])
  test(
    'diorama framing and tools ' + width + 'x' + height,
    async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page)
      await expect(page.locator('.house-menu')).not.toHaveAttribute('open', '')
      await expect(page.locator('header')).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Перемещение', exact: true }),
      ).not.toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width)
      const box = (await page.locator('canvas').boundingBox())!
      expect(box.height).toBe(height)
      for (const id of [
        'roller',
        'sponge',
        'cream',
        'sage',
        'terracotta',
      ] as const) {
        const p = await world(
          page,
          toolPositions[id][0],
          toolPositions[id][1],
          toolPositions[id][2],
        )
        expect(p.x).toBeGreaterThan(20)
        expect(p.x).toBeLessThan(width - 15)
        expect(p.y).toBeGreaterThan(40)
        expect(p.y).toBeLessThan(height - 25)
      }
      const left = await world(page, -5, 0, 3.5),
        right = await world(page, 5, 0, -3.5)
      expect(Math.abs(right.x - left.x)).toBeGreaterThan(width * 0.45)
      await page.screenshot({ path: 'artifacts/diorama-' + width + '.png' })
      await page.getByRole('button', { name: 'Открыть записку' }).click()
      await expect(
        page.getByRole('region', { name: 'Записка для нового хозяина' }),
      ).toBeVisible()
      await page.waitForTimeout(260)
      await page.screenshot({
        path: 'artifacts/diorama-note-' + width + '.png',
      })
      await page.getByRole('button', { name: 'Закрыть записку' }).click()
      await tool(page, 'roller')
      await expect(page.locator('.tool-context')).toContainText('Валик')
      await page.keyboard.press('Escape')
      await expect(page.locator('.tool-context')).toBeHidden()
      await tool(page, 'sponge')
      await expect(page.locator('.tool-context')).toContainText('Губка')
      await page.keyboard.press('Escape')
    },
  )
test('physical tools, pigment, real walls, undo, holes and note cancellation', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await tool(page, 'roller')
  await tool(page, 'terracotta')
  const w = paintWalls[0]
  await move(page, w, 0, 0.7)
  await page.screenshot({ path: 'artifacts/wall-full-before.png' })
  await stroke(page, w, 0.7, -2.7, 2.7)
  const first = await percent(page)
  expect(first).toBeGreaterThan(0)
  expect(first).toBeLessThan(20)
  await page.mouse.move(30, 60)
  await page.screenshot({ path: 'artifacts/wall-full-stroke.png' })
  await stroke(page, w, 0.7, -2.7, 2.7)
  expect(await percent(page)).toBe(first)
  for (const v of [0.9, 1.1, 1.3, 0.5, 0.3]) await stroke(page, w, v, -2.7, 2.7)
  await page.screenshot({ path: 'artifacts/wall-full-partial.png' })
  expect(await percent(page)).toBeGreaterThan(first)
  await page.keyboard.press('Control+z')
  expect(await percent(page)).toBeLessThan(50)
  await page.keyboard.press('Control+y')
  const saved = await percent(page)
  await move(page, w, -2.7, -0.1)
  await page.mouse.down()
  await move(page, w, 2.7, -0.1)
  await page
    .getByRole('button', { name: 'Открыть записку' })
    .evaluate((b: HTMLButtonElement) => b.click())
  await page.mouse.up()
  await page.getByRole('button', { name: 'Закрыть записку' }).click()
  await move(page, w, 0, 0.7)
  expect(await percent(page)).toBe(saved)
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('')
  const rear = paintWalls.find((w) => w.id === 'living-rear')!
  await move(page, rear, 0, 0.17)
  await page.mouse.down()
  await move(page, rear, 0.3, 0.17)
  await page.mouse.up()
  await move(page, w, 0, 0.7)
  expect(await percent(page)).toBe(saved)
  await page.keyboard.press('Escape')
  await tool(page, 'sponge')
  await expect(page.locator('.tool-context')).toContainText('Губка')
  const a = await world(page, -3.55, 0.019, 2.45),
    b = await world(page, -2.75, 0.019, 2.45)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
  const wiped = await percent(page)
  expect(wiped).toBeGreaterThan(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('active-tool-progress')).toHaveText('0%')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('active-tool-progress')).toHaveText(wiped + '%')
  await page.getByRole('button', { name: 'Открыть записку' }).click()
  await expect(page.getByTestId('task-floor-living')).not.toContainText('0%')
  await page.getByRole('button', { name: 'Закрыть записку' }).click()
  await page.keyboard.press('Escape')
  const trash = await world(page, -4.45, 0.12, -1.3)
  await page.keyboard.down('Shift')
  await page.mouse.click(trash.x, trash.y)
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Открыть записку' }).click()
  await expect(page.getByTestId('task-trash-living')).toContainText('1 / 5')
  await expect(page.getByTestId('task-trash-bedroom')).toContainText('0 / 4')
  expect(errors).toEqual([])
})
test('whole lintel can be painted to completion without filling the doorway, with history', async ({
  page,
}) => {
  await open(page)
  await tool(page, 'roller')
  const w = paintWalls.find((w) => w.id === 'bedroom-door-top')!
  await move(page, w, 0, 0)
  await page.screenshot({ path: 'artifacts/lintel-before.png' })
  await stroke(page, w, 0)
  await page.screenshot({ path: 'artifacts/lintel-one.png' })
  expect(await percent(page)).toBeGreaterThan(0)
  expect(await percent(page)).toBeLessThan(70)
  for (const v of [-0.2, -0.1, 0.1]) await stroke(page, w, v)
  await page.screenshot({ path: 'artifacts/lintel-half.png' })
  for (const v of [-0.249, -0.15, -0.05, 0.05, 0.15, 0.249]) {
    if ((await percent(page)) === 100) break
    await stroke(page, w, v, -w.w / 2, w.w / 2)
  }
  await expect(page.getByTestId('active-tool-progress')).toHaveText('100%')
  await expect(page.locator('footer')).toContainText('Стена покрашена!')
  await page.mouse.move(30, 60)
  await page.screenshot({ path: 'artifacts/lintel-complete.png' })
  await page.keyboard.press('Control+z')
  expect(await percent(page)).toBeLessThan(100)
  await page.keyboard.press('Control+y')
  expect(await percent(page)).toBe(100)
})

test('normal 3D furniture input after tools supports concurrent rotation, drawers and lamp without Tab', async ({
  page,
}) => {
  await open(page)
  await tool(page, 'roller')
  await page.keyboard.press('Escape')
  const start = await world(page, -2.8, 0.59, -0.4)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.keyboard.down('r')
  for (const [x, z] of [
    [-2.5, -0.3],
    [-2.7, 0.1],
    [-2.5, 0.2],
  ]) {
    const p = await world(page, x, 0.59, z)
    await page.mouse.move(p.x, p.y, { steps: 6 })
    await page.waitForTimeout(70)
  }
  await page.keyboard.up('r')
  const turning = await page.getByTestId('pose').textContent()
  const p = await world(page, -2.4, 0.59, 0.3)
  await page.mouse.move(p.x, p.y, { steps: 6 })
  await page.mouse.up()
  const final = await page.getByTestId('pose').textContent()
  expect(final).not.toBe(turning)
  expect(final).not.toContain('0°')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText(final!)
  await clickWorld(page, 4, 1, 3)
  await expect(page.locator('footer')).toContainText('Состояние ящика изменено')
  await page.keyboard.press('Control+z')
  await clickWorld(page, 4.25, 1.8, -2.7)
  await expect(page.locator('footer')).toContainText('Торшер включается')
})

test('normal bin drag and classic trash disposal work without selecting a mode', async ({
  page,
}) => {
  await open(page)
  const a = await world(page, -4.45, 0.2, 2.75),
    b = await world(page, -4.05, 0.2, 2.75)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('.selection strong')).toContainText(
    'Ведро гостиной',
  )
  const values = (await page.getByTestId('pose').textContent())!
    .match(/-?\d+(?:\.\d+)?/g)!
    .map(Number)
  expect(values[0]).toBeGreaterThan(-4.3)
  await clickWorld(page, -4.45, 0.12, -1.3)
  await expect(page.locator('footer')).toContainText('Подобрано')
  await clickWorld(page, values[0], 0.2, values[1])
  await page.getByRole('button', { name: 'Открыть записку' }).click()
  await expect(page.getByTestId('task-trash-living')).toContainText('1 / 5')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('task-trash-living')).toContainText('0 / 5')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('task-trash-living')).toContainText('1 / 5')
})

test('paint follows rear walls and both wall orientations after orbit, leaving openings intact', async ({
  page,
}) => {
  await open(page)
  await tool(page, 'roller')
  for (const id of ['living-rear', 'bedroom-rear']) {
    const w = paintWalls.find((w) => w.id === id)!
    await stroke(page, w, 1.2, -2.1, 2.1)
    expect(await percent(page)).toBeGreaterThan(0)
  }
  const orbit = async (dx: number) => {
    await page.mouse.move(700, 500)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(700 + dx, 500, { steps: 12 })
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(500)
  }
  await orbit(214)
  let w = paintWalls.find((w) => w.id === 'living-partition')!
  await stroke(page, w, 0.7, -1.5, 1.5)
  expect(await percent(page)).toBeGreaterThan(0)
  w = paintWalls.find((w) => w.id === 'bedroom-east')!
  await stroke(page, w, 0.15, -1.7, -0.2)
  expect(await percent(page)).toBeGreaterThan(0)
  await page.mouse.move(30, 80)
  await page.screenshot({ path: 'artifacts/paint-opposite-faces.png' })
  await orbit(500)
  w = paintWalls.find((w) => w.id === 'living-front')!
  await stroke(page, w, 0, -2.9, -2.2)
  expect(await percent(page)).toBeGreaterThan(0)
  await page.mouse.move(30, 80)
  await page.screenshot({ path: 'artifacts/paint-front-inner-face.png' })
})
