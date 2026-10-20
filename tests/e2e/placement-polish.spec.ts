import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

const select = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()
async function point(page: Page, x: number, y: number, z: number) {
  const b = (await page.locator('canvas').boundingBox())!
  const state = JSON.parse(
    (await page.locator('canvas').getAttribute('data-camera'))!,
  )
  const camera = new OrthographicCamera(
    -b.width / 2,
    b.width / 2,
    b.height / 2,
    -b.height / 2,
    0.1,
    250,
  )
  camera.position.fromArray(state.position)
  camera.lookAt(new Vector3().fromArray(state.target))
  camera.zoom = state.zoom
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(camera)
  return {
    x: b.x + ((p.x + 1) * b.width) / 2,
    y: b.y + ((1 - p.y) * b.height) / 2,
  }
}
async function move(page: Page, x: number, y: number, z: number) {
  const p = await point(page, x, y, z)
  await page.mouse.move(p.x, p.y)
  return p
}
async function drop(page: Page, x: number, y: number, z: number) {
  const p = await move(page, x, y, z)
  await page.mouse.click(p.x, p.y)
}
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
}

test('cup, book and box can use floor and rugs, reject real collisions, and return to tabletop and drawer', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await move(page, -1.5, 0.015, 0)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  await drop(page, -1.5, 0.015, 0)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await expect(page.getByTestId('pose')).toHaveText('X -1.50 · Z 0.00 · 0°')
  await page.screenshot({ path: 'artifacts/035-cup-on-rug.png' })
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await select(page, 'Книга')
  await select(page, 'Взять предмет')
  await move(page, -1.5, 0.015, 0)
  await expect(page.locator('footer .invalid')).toContainText('другой предмет')
  await drop(page, -1.5, 0.015, 0.65)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await select(page, 'Декоративная коробка')
  await select(page, 'Взять предмет')
  await drop(page, -4.5, 0.015, -0.6)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await expect(page.getByTestId('pose')).toHaveText('X -4.50 · Z -0.60 · 0°')
  await page.screenshot({ path: 'artifacts/035-box-on-bare-floor.png' })
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await drop(page, -2.8, 0.595, -0.4)
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await select(page, 'Дубовый комод')
  await page.keyboard.press('Tab')
  await select(page, 'Открыть ящик 1')
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await select(page, 'В ящик 1: Дубовый комод')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Дубовый комод',
  )
  await select(page, 'Дубовый комод')
  await select(page, 'Закрыть ящик 1')
  await select(page, 'Открыть ящик 1')
  await select(page, 'Достать: Чашка')
  await drop(page, -1.5, 0.015, 0)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await expect(page.locator('.item-list button')).toHaveCount(15)
  await expect(
    page.getByRole('button', { name: 'Чашка', exact: true }),
  ).toHaveCount(1)
  expect(errors).toEqual([])
})

test('small-object red feedback uses tight geometry and small gaps instead of large furniture reserves', async ({
  page,
}) => {
  await open(page)
  // Empty the tabletop so the handle can approach its true edge.
  await select(page, 'Книга')
  await select(page, 'Взять предмет')
  await drop(page, -1.5, 0.015, 0.65)
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await move(page, -2.26, 0.595, -0.4)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/035-valid-cup-table-edge.png' })
  await move(page, -2.245, 0.595, -0.4)
  await expect(page.locator('footer .invalid')).toContainText('край')
  // Beside the low sofa base: 2 cm of visible clearance is allowed.
  await move(page, -2.8, 0.015, -1.8)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/035-valid-cup-near-sofa.png' })
  await move(page, -2.8, 0.015, -1.85)
  await expect(page.locator('footer .invalid')).toContainText('другой предмет')
  await page.screenshot({ path: 'artifacts/035-invalid-cup-sofa.png' })
  await page.keyboard.press('Escape')
})

test('release in red returns exactly to the last green pose, records one action and clears stale sessions on Esc', async ({
  page,
}) => {
  await open(page)
  const start = await move(page, -2.8, 0.595, -0.4)
  await page.mouse.down()
  // Keep the same grab plane; only one deliberate valid checkpoint.
  await move(page, -1.5, 0.595, 0)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  const checkpoint = await page.getByTestId('pose').textContent()
  await move(page, 0, 0.595, 0)
  await expect(page.locator('footer .invalid')).toBeVisible()
  await page.screenshot({ path: 'artifacts/035-red-before-drop.png' })
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText(checkpoint!)
  await expect(page.locator('footer')).toContainText('последнюю допустимую')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText(checkpoint!)
  await page.keyboard.press('Control+z')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await move(page, -1.5, 0.595, 0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await select(page, 'Журнальный стол')
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  // No valid intermediate sample: return to origin rather than the previous gesture.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await move(page, 0, 0.595, 0)
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
})

test('dragged cup falls back to its last floor position, with one undo back to its former tabletop', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Чашка')
  await move(page, -2.46, 0.75, -0.27)
  await page.mouse.down()
  await move(page, -1.5, 0.015, 0)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  const checkpoint = await page.getByTestId('pose').textContent()
  await move(page, 0, 0.015, 0)
  await expect(page.locator('footer .invalid')).toBeVisible()
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText(checkpoint!)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await page.screenshot({ path: 'artifacts/035-cup-after-fallback.png' })
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText(checkpoint!)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
})
