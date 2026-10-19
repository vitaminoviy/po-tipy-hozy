import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
}
async function point(page: Page, x: number, y: number, z: number) {
  const b = (await page.locator('canvas').boundingBox())!,
    camera = new OrthographicCamera(
      -b.width / 2,
      b.width / 2,
      b.height / 2,
      -b.height / 2,
      0.1,
      250,
    )
  camera.position.set(12, 11, 15)
  camera.lookAt(0, 0, 0)
  camera.zoom = Math.min(46, b.width / 14, b.height / 10)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(camera)
  return {
    x: b.x + ((p.x + 1) * b.width) / 2,
    y: b.y + ((1 - p.y) * b.height) / 2,
  }
}
async function clickWorld(page: Page, x: number, y: number, z: number) {
  const p = await point(page, x, y, z)
  await page.mouse.click(p.x, p.y)
}
async function drag(
  page: Page,
  from: [number, number, number],
  dx: number,
  dz: number,
) {
  const a = await point(page, ...from),
    b = await point(page, from[0] + dx, from[1], from[2] + dz)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 16 })
  await page.mouse.up()
}
const pose = (page: Page) => page.getByTestId('pose')
const select = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()
const shot = (page: Page) =>
  page.locator('canvas').screenshot({
    style:
      '.scene-heading,.interaction-tools,.view-tools,.room-labels,.selection{visibility:hidden!important}',
  })

test('drawers animate independently, interaction never drags, move closes them, undo restores the state', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await select(page, 'Дубовый комод')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: /^Взаимодействие/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  const closed = await shot(page)
  await clickWorld(page, 4, 0.3, 3.04)
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 1', exact: true }),
  ).toBeVisible()
  await expect(pose(page)).toHaveText('X 4.00 · Z 2.65 · 0°')
  await page.waitForTimeout(100)
  const mid = await shot(page)
  await page.waitForTimeout(800)
  const opened = await shot(page)
  expect(mid.equals(closed)).toBe(false)
  expect(mid.equals(opened)).toBe(false)
  await expect(
    page.getByRole('button', { name: 'Открыть ящик 2', exact: true }),
  ).toBeVisible()
  await select(page, 'Открыть ящик 2')
  await page.keyboard.press('Control+z')
  await expect(
    page.getByRole('button', { name: 'Открыть ящик 2', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 2', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'artifacts/drawers-open.png' })
  await page.keyboard.press('Tab')
  await drag(page, [4, 1.28, 2.65], -0.25, -0.25)
  await expect(pose(page)).toHaveText('X 3.75 · Z 2.40 · 0°')
  await page.keyboard.press('Tab')
  for (let n = 1; n <= 3; n++)
    await expect(
      page.getByRole('button', { name: `Открыть ящик ${n}`, exact: true }),
    ).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(pose(page)).toHaveText('X 4.00 · Z 2.65 · 0°')
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 1', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 2', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+y')
  await expect(pose(page)).toHaveText('X 3.75 · Z 2.40 · 0°')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({ path: 'artifacts/interactions-mobile.png' })
  expect(errors).toEqual([])
})

test('lamp fades real illumination, remains usable after moving, and new commands clear redo', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await select(page, 'Торшер')
  await page.keyboard.press('Tab')
  const floor = await point(page, 4.6, 0, -1.7)
  const floorShot = () =>
    page.screenshot({
      clip: { x: floor.x - 25, y: floor.y - 20, width: 50, height: 40 },
    })
  const darkFloor = await floorShot(),
    off = await shot(page)
  await clickWorld(page, 4.25, 1.6, -2.7)
  await expect(
    page.getByRole('button', { name: 'Выключить торшер', exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(100)
  const mid = await shot(page)
  await page.waitForTimeout(1100)
  const on = await shot(page)
  expect(mid.equals(off)).toBe(false)
  expect(mid.equals(on)).toBe(false)
  expect((await floorShot()).equals(darkFloor)).toBe(false)
  await page.screenshot({ path: 'artifacts/lamp-on.png' })
  await page.keyboard.press('Tab')
  await drag(page, [4.25, 1.6, -2.7], 0.25, 1)
  await expect(pose(page)).toHaveText('X 4.50 · Z -1.70 · 0°')
  await page.keyboard.press('Tab')
  await clickWorld(page, 4.5, 1.6, -1.7)
  await expect(
    page.getByRole('button', { name: 'Включить торшер', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(
    page.getByRole('button', { name: 'Выключить торшер', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(pose(page)).toHaveText('X 4.25 · Z -2.70 · 0°')
  await select(page, 'Выключить торшер')
  await expect(
    page.getByRole('button', { name: 'Повторить действие', exact: true }),
  ).toBeDisabled()
  expect(errors).toEqual([])
})

test('small objects attach to surfaces, reject edges and overlap, follow parent transforms and support history', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await select(page, 'Книга')
  await select(page, 'Взять предмет')
  await clickWorld(page, 1.05, 0.82, -2.6)
  await expect(page.getByTestId('attachment')).toContainText(
    'Прикроватная тумба',
  )
  await expect(pose(page)).toHaveText('X 1.05 · Z -2.60 · 0°')
  await page.getByRole('button', { name: /Повернуть/ }).click()
  await expect(pose(page)).toContainText('90°')
  await page.keyboard.press('Tab')
  await clickWorld(page, 1.05, 0.89, -2.6)
  await expect(
    page.getByRole('button', { name: 'Отменить', exact: true }),
  ).toBeVisible()
  await clickWorld(page, -2.46, 0.595, -0.27)
  await expect(page.locator('footer')).toContainText('другой предмет')
  await clickWorld(page, -2.17, 0.595, -0.4)
  await expect(page.locator('footer')).toContainText('край поверхности')
  await clickWorld(page, -1, 0, 2)
  await expect(page.locator('footer')).toContainText('Нужна поверхность')
  await page.keyboard.press('Escape')
  await select(page, 'Книга')
  await expect(page.getByTestId('attachment')).toContainText(
    'Прикроватная тумба',
  )
  await page.keyboard.press('Tab')
  await select(page, 'Прикроватная тумба')
  // Grab the clear corner; the centre is occupied by the independently pickable book.
  await drag(page, [1.3, 0.82, -2.6], 0, 1.5)
  await page.getByRole('button', { name: /Повернуть/ }).click()
  await select(page, 'Книга')
  await expect(pose(page)).toHaveText('X 1.05 · Z -1.10 · 180°')
  const start = await point(page, 1.05, 0.89, -1.1)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (const x of [4.3, 4.2]) {
    const target = await point(page, x, 1.285, 2.65)
    await page.mouse.move(target.x, target.y, { steps: 12 })
    await expect(page.getByTestId('attachment')).toContainText('Дубовый комод')
    await expect(pose(page)).toContainText('180°')
  }
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('Предмет размещён')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toContainText(
    'Прикроватная тумба',
  )
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByTestId('attachment')).toContainText('Дубовый комод')
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await clickWorld(page, 1.05, 0.82, -1.1)
  await expect(page.getByTestId('attachment')).toContainText(
    'Прикроватная тумба',
  )
  await select(page, 'Декоративная коробка')
  await select(page, 'Взять предмет')
  await clickWorld(page, -2.8, 0.595, -0.4)
  await expect(page.getByTestId('attachment')).toContainText('Журнальный стол')
  await page.screenshot({ path: 'artifacts/surface-decor.png' })
  expect(errors).toEqual([])
})

test('undo and mode changes cancel an active drag; camera still orbits in interaction mode', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Журнальный стол')
  await page.getByRole('button', { name: /Повернуть/ }).click()
  const start = await point(page, -2.8, 0.59, -0.4),
    end = await point(page, -1.5, 0.59, 1)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 10 })
  await page.keyboard.press('Control+z')
  await page.mouse.up()
  await expect(pose(page)).toHaveText('X -2.80 · Z -0.40 · 0°')
  await page.keyboard.press('Control+y')
  await expect(pose(page)).toContainText('90°')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 10 })
  await page.keyboard.press('Tab')
  await page.mouse.up()
  await expect(pose(page)).toHaveText('X -2.80 · Z -0.40 · 90°')
  const before = await shot(page)
  await page.mouse.move(1000, 650)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1100, 600, { steps: 12 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(500)
  expect((await shot(page)).equals(before)).toBe(false)
  await expect(pose(page)).toHaveText('X -2.80 · Z -0.40 · 90°')
})
