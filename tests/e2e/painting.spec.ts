import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'
import { paintWalls, type PaintWall } from '../../src/painting'

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
async function point(page: Page, wall: PaintWall, u: number, v: number) {
  return worldPoint(page, wall.x, wall.y + v, wall.z - u)
}
async function worldPoint(page: Page, x: number, y: number, z: number) {
  const b = (await page.locator('canvas').boundingBox())!
  const state = JSON.parse(
    (await page.locator('canvas').getAttribute('data-camera'))!,
  )
  const c = new OrthographicCamera(
    -b.width / 2,
    b.width / 2,
    b.height / 2,
    -b.height / 2,
    0.1,
    250,
  )
  c.position.fromArray(state.position)
  c.lookAt(new Vector3().fromArray(state.target))
  c.zoom = state.zoom
  c.updateProjectionMatrix()
  c.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(c)
  return {
    x: b.x + ((p.x + 1) * b.width) / 2,
    y: b.y + ((1 - p.y) * b.height) / 2,
  }
}
async function move(
  page: Page,
  wall: PaintWall,
  u: number,
  v: number,
  steps = 1,
) {
  const p = await point(page, wall, u, v)
  await page.mouse.move(p.x, p.y, { steps })
}
async function stroke(page: Page, wall: PaintWall, v: number) {
  await move(page, wall, -1.15, v)
  await page.mouse.down()
  await move(page, wall, 1.15, v, 8)
  await page.mouse.up()
}
const percent = async (page: Page) =>
  Number(
    (await page.getByTestId('paint-progress').innerText()).replace('%', ''),
  )

test('fast vertical and diagonal roller motion stays local; windows are not paint targets', async ({
  page,
}) => {
  await open(page)
  const wall = paintWalls[0]
  await move(page, wall, -0.7, -0.55)
  await page.mouse.down()
  await move(page, wall, -0.7, 0.55)
  await page.mouse.up()
  const vertical = await percent(page)
  expect(vertical).toBeGreaterThan(8)
  expect(vertical).toBeLessThan(25)
  await page.screenshot({ path: 'artifacts/paint-vertical.png' })
  const diagonal = async () => {
    await move(page, wall, -0.9, -0.5)
    await page.mouse.down()
    await move(page, wall, 0.9, 0.5)
    await page.mouse.up()
  }
  await diagonal()
  const first = await percent(page)
  expect(first).toBeGreaterThan(vertical + 5)
  expect(first).toBeLessThan(50)
  await page.screenshot({ path: 'artifacts/paint-diagonal.png' })
  await diagonal()
  expect(await percent(page)).toBe(first)
  await move(page, wall, -1.15, 0.6)
  await page.mouse.down()
  await move(page, wall, 2, 0.6)
  await page.mouse.up()
  const tail = await percent(page)
  expect(tail).toBeGreaterThan(first + 5)
  const window = await worldPoint(page, -2.5, 1.8, -3.38)
  await page.mouse.click(window.x, window.y)
  await move(page, wall, 0, 0)
  expect(await percent(page)).toBe(tail)
})

for (const [index, color] of [
  [0, 'Шалфейный'],
  [1, 'Терракотовый'],
] as const)
  test(`visible ${paintWalls[index].id} paints along real strokes, keeps partial color and reaches completion with visual stages`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await open(page)
    const wall = paintWalls[index]
    await page.getByRole('button', { name: color, exact: true }).click()
    await move(page, wall, 0, 0)
    expect(await percent(page)).toBe(0)
    await page.screenshot({ path: `artifacts/paint-${index}-before.png` })
    await stroke(page, wall, 0)
    const first = await percent(page)
    expect(first).toBeGreaterThan(5)
    expect(first).toBeLessThan(25)
    await page.screenshot({ path: `artifacts/paint-${index}-stroke.png` })
    await stroke(page, wall, 0)
    expect(await percent(page)).toBe(first)
    for (const v of [-0.5, -0.3, -0.1]) await stroke(page, wall, v)
    const half = await percent(page)
    expect(half).toBeGreaterThan(35)
    expect(half).toBeLessThan(75)
    await page.screenshot({ path: `artifacts/paint-${index}-half.png` })
    for (let n = 0; n < 13; n++) await stroke(page, wall, -0.64 + n * 0.1)
    await expect(page.getByTestId('paint-progress')).toHaveText('100%')
    await expect(page.locator('footer')).toContainText('Стена покрашена!')
    await page.screenshot({ path: `artifacts/paint-${index}-complete.png` })
    await page.keyboard.press('Control+z')
    expect(await percent(page)).toBeLessThan(100)
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('paint-progress')).toHaveText('100%')
    const other = paintWalls[1 - index]
    await move(page, other, 0, 0)
    expect(await percent(page)).toBe(0)
    expect(errors).toEqual([])
  })

test('multiple gestures undo separately, lock color, preserve masks through modes and restore a fresh page', async ({
  page,
}) => {
  await open(page)
  const wall = paintWalls[0]
  for (const v of [-0.4, 0, 0.4]) await stroke(page, wall, v)
  const three = await percent(page)
  for (let n = 0; n < 3; n++) await page.keyboard.press('Control+z')
  await expect(page.getByTestId('paint-progress')).toHaveText('0%')
  for (let n = 0; n < 3; n++) await page.keyboard.press('Control+y')
  expect(await percent(page)).toBe(three)
  await page.getByRole('button', { name: 'Кремовый', exact: true }).click()
  await stroke(page, wall, 0.6)
  await expect(page.locator('footer')).toContainText('Цвет стены закреплён')
  expect(await percent(page)).toBe(three)
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await move(page, wall, 0, 0)
  expect(await percent(page)).toBe(three)
  await page.reload()
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.waitForTimeout(100)
  await move(page, wall, 0, 0)
  expect(await percent(page)).toBe(0)
})

test('fast exit and re-entry break the stroke instead of painting an unvisited diagonal', async ({
  page,
}) => {
  await open(page)
  const wall = paintWalls[0]
  await page.mouse.move(1400, 950)
  const before = await page.screenshot()
  await move(page, wall, -1, -0.45)
  await page.mouse.down()
  await move(page, wall, -0.75, -0.45, 3)
  await move(page, wall, 0, 1)
  await move(page, wall, 0.7, 0.45)
  await move(page, wall, 1, 0.45, 3)
  await page.mouse.up()
  expect(await percent(page)).toBeGreaterThan(1)
  expect(await percent(page)).toBeLessThan(25)
  await page.mouse.move(1400, 950)
  const after = await page.screenshot({
    path: 'artifacts/paint-disconnected.png',
  })
  const points = await Promise.all(
    [
      [0, 0],
      [-0.875, -0.45],
    ].map(([u, v]) => point(page, wall, u, v)),
  )
  const differences = await page.evaluate(
    async ({ a, b, points }) => {
      const samples = await Promise.all(
        [a, b].map(async (bytes) => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          )
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
          return points.map((p) =>
            [
              ...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data,
            ].slice(0, 3),
          )
        }),
      )
      return points.map((_, i) =>
        Math.max(
          ...samples[0][i].map((v, c) => Math.abs(v - samples[1][i][c])),
        ),
      )
    },
    { a: [...before], b: [...after], points },
  )
  expect(differences[0]).toBeLessThanOrEqual(2)
  expect(differences[1]).toBeGreaterThan(8)
})

test('two different wall colors survive trash cleanup, floor wiping and their undo actions', async ({
  page,
}) => {
  await open(page)
  await stroke(page, paintWalls[0], 0)
  const living = await percent(page)
  await page.getByRole('button', { name: 'Терракотовый', exact: true }).click()
  await stroke(page, paintWalls[1], 0)
  const bedroom = await percent(page)
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  const trash = await worldPoint(page, -4.45, 0.12, -1.3)
  await page.keyboard.down('Shift')
  await page.mouse.click(trash.x, trash.y)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('cleaning-living')).toContainText('1 / 5')
  const a = await worldPoint(page, -3.55, 0.019, 2.45),
    b = await worldPoint(page, -2.75, 0.019, 2.45)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('floor-living')).not.toHaveText('0%')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('floor-living')).toHaveText('0%')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('cleaning-living')).toContainText('0 / 5')
  await page.getByRole('button', { name: 'Покраска', exact: true }).click()
  await page.waitForTimeout(100)
  await move(page, paintWalls[0], 0, 0)
  expect(await percent(page)).toBe(living)
  await move(page, paintWalls[1], 0, 0)
  expect(await percent(page)).toBe(bedroom)
})

test('changing paint tool or palette during a held stroke cancels the private mask and leaves no stuck gesture', async ({
  page,
}) => {
  await open(page)
  const wall = paintWalls[0]
  for (const label of ['Покраска', 'Кремовый', 'Скрыть стены']) {
    await move(page, wall, -1, 0)
    await page.mouse.down()
    await move(page, wall, 1, 0, 8)
    expect(await percent(page)).toBeGreaterThan(0)
    await page
      .getByRole('button', { name: label, exact: label !== 'Скрыть стены' })
      .evaluate((button: HTMLButtonElement) => button.click())
    await page.mouse.up()
    if (label === 'Покраска')
      await page.getByRole('button', { name: label, exact: true }).click()
    if (label === 'Скрыть стены') {
      await page.getByRole('button', { name: 'Показать стены' }).click()
      await page.waitForTimeout(100)
    }
    await move(page, wall, 0, 0)
    expect(await percent(page)).toBe(0)
  }
  await stroke(page, wall, 0)
  expect(await percent(page)).toBeGreaterThan(0)
})

test('Esc, blur, tool/mode changes and release outside terminate private paint without stale continuation', async ({
  page,
}) => {
  await open(page)
  const wall = paintWalls[0]
  for (const cancel of ['Escape', 'blur', 'Tab']) {
    await move(page, wall, -1, 0)
    await page.mouse.down()
    await move(page, wall, 1, 0, 8)
    expect(await percent(page)).toBeGreaterThan(0)
    if (cancel === 'blur')
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else await page.keyboard.press(cancel)
    await page.mouse.up()
    if (cancel === 'Tab') {
      await page.keyboard.press('Tab')
      await page.getByRole('button', { name: 'Покраска', exact: true }).click()
    }
    await move(page, wall, 0, 0)
    expect(await percent(page)).toBe(0)
  }
  await move(page, wall, -1, 0)
  await page.mouse.down()
  await move(page, wall, 0.2, 0, 5)
  await page.mouse.move(1400, 950)
  await page.mouse.up()
  await move(page, wall, 0, 0)
  const stopped = await percent(page)
  expect(stopped).toBeGreaterThan(0)
  await move(page, wall, 0.8, 0.5, 8)
  expect(await percent(page)).toBe(stopped)
})

test('hidden walls do not intercept paint; camera changes keep coordinate mapping and other actions recover when tool is off', async ({
  page,
}) => {
  await open(page, true)
  await expect(page.getByRole('button', { name: 'Скрыть стены' })).toBeVisible()
  const wall = paintWalls[1]
  await stroke(page, wall, 0)
  const before = await percent(page)
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await stroke(page, wall, 0.4)
  expect(await percent(page)).toBe(before)
  await page.getByRole('button', { name: 'Показать стены' }).click()
  await page.waitForTimeout(100)
  const b = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(b.x + b.width / 2 + 35, b.y + b.height / 2 + 20, {
    steps: 8,
  })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(350)
  await move(page, wall, 0, 0)
  expect(await percent(page)).toBe(before)
  await stroke(page, wall, 0.3)
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
