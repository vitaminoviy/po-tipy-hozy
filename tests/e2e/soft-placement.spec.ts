import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'
const select = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()
async function point(page: Page, x: number, y: number, z: number) {
  const b = (await page.locator('canvas').boundingBox())!,
    state = JSON.parse(
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
async function take(page: Page, name: string) {
  await select(page, name)
  await page.keyboard.press('e')
}

test('cup on blanket, book on sofa and box on chair keep real support and follow host movement', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await take(page, 'Чашка')
  await drop(page, 2.8, 0.88, -1.3)
  await expect(page.getByTestId('attachment')).toHaveText(
    'На: Кровать «Облако»',
  )
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.30 · 0°')
  await page.screenshot({ path: 'artifacts/036-cup-bed.png' })
  await take(page, 'Книга')
  await drop(page, -2.27, 0.855, -2.42)
  await expect(page.getByTestId('attachment')).toHaveText('На: Диван «Мох»')
  await expect(page.getByTestId('pose')).toHaveText('X -2.27 · Z -2.42 · 0°')
  await page.screenshot({ path: 'artifacts/036-book-sofa.png' })
  await take(page, 'Декоративная коробка')
  await drop(page, -3.94, 0.845, 1.6)
  await expect(page.getByTestId('attachment')).toHaveText('На: Мягкое кресло')
  await expect(page.getByTestId('pose')).toHaveText('X -3.94 · Z 1.60 · 0°')
  await page.screenshot({ path: 'artifacts/036-box-chair.png' })
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText('На: Дубовый комод')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('attachment')).toHaveText('На: Мягкое кресло')
  await select(page, 'Мягкое кресло')
  await page.getByRole('button', { name: /Повернуть/ }).click()
  await select(page, 'Декоративная коробка')
  await expect(page.getByTestId('pose')).toHaveText('X -4.00 · Z 1.54 · 90°')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X -3.94 · Z 1.60 · 0°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText('X -4.00 · Z 1.54 · 90°')
  // Move the existing bed through the ordinary controls.
  await select(page, 'Кровать «Облако»')
  await select(page, 'Переместить')
  await drop(page, 2.8, 0, -1.4)
  await select(page, 'Чашка')
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.05 · 0°')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.30 · 0°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.05 · 0°')
  await expect(page.locator('.item-list button')).toHaveCount(15)
  expect(errors).toEqual([])
})

test('pillows and blanket fold reject a draft; a physical drag rolls back to the last soft anchor', async ({
  page,
}) => {
  await open(page)
  await take(page, 'Чашка')
  await move(page, 2.8, 0.88, -1.3)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  await drop(page, 2.8, 0.88, -1.3)
  // Pick the cup body, then deliberately keep one valid seat checkpoint.
  await move(page, 2.8, 0.99, -1.3)
  await page.mouse.down()
  await move(page, 2.8, 0.88, -1.45)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  const checkpoint = await page.getByTestId('pose').textContent()
  await move(page, 2.8, 0.75, -2.51) // Existing pillows occupy this mattress region.
  await expect(page.locator('footer .invalid')).toBeVisible()
  await page.screenshot({ path: 'artifacts/036-invalid-bed-pillow.png' })
  await page.mouse.up()
  await expect(page.getByTestId('pose')).toHaveText(checkpoint!)
  await expect(page.getByTestId('attachment')).toHaveText(
    'На: Кровать «Облако»',
  )
  await expect(page.locator('footer')).toContainText('последнюю допустимую')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X 2.80 · Z -1.30 · 0°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText(checkpoint!)
  await take(page, 'Книга')
  await move(page, -3.33, 0.855, -2.68)
  await expect(page.locator('footer .invalid')).toBeVisible()
  await page.screenshot({ path: 'artifacts/036-invalid-sofa-pillow.png' })
  await page.keyboard.press('Escape')
})

test('soft to floor, tabletop and drawer transfers preserve identity and old placement routes', async ({
  page,
}) => {
  await open(page)
  await take(page, 'Чашка')
  await drop(page, 2.8, 0.88, -1.3)
  await take(page, 'Чашка')
  await drop(page, -1.5, 0.015, 0)
  await expect(page.getByTestId('attachment')).toHaveText('На полу')
  await take(page, 'Чашка')
  await drop(page, -2.45, 0.595, -0.25)
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await expect(
    page.getByRole('button', { name: 'Взять предмет', exact: true }),
  ).toBeVisible()
  await select(page, 'Прикроватная тумба')
  await page.keyboard.press('Tab')
  await select(page, 'Открыть ящик 1')
  await take(page, 'Чашка')
  await select(page, 'В ящик 1: Прикроватная тумба')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Прикроватная тумба',
  )
  await select(page, 'Прикроватная тумба')
  await select(page, 'Закрыть ящик 1')
  await select(page, 'Открыть ящик 1')
  await select(page, 'Достать: Чашка')
  await drop(page, -3.94, 0.845, 1.6)
  await expect(page.getByTestId('attachment')).toHaveText('На: Мягкое кресло')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Прикроватная тумба',
  )
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('attachment')).toHaveText('На: Мягкое кресло')
  await expect(
    page.getByRole('button', { name: 'Чашка', exact: true }),
  ).toHaveCount(1)
})

test('floor approaches to bed, sofa, chair, cabinet and nightstand turn red at actual contact', async ({
  page,
}) => {
  await open(page)
  await take(page, 'Чашка')
  for (const [label, x, z, insideX, insideZ] of [
    ['bed', 2.8, -0.225, 2.8, -0.245], // Front face -0.325, cup radius .09: 1 cm gap.
    ['sofa', -2.8, -1.81, -2.8, -1.83],
    ['chair', -4, 2.19, -4, 2.17],
    ['cabinet', 4, 3.11, 4, 3.09],
    // The floor in front of the nightstand is occluded by the bed at this
    // camera angle. Use its visible left side, not a ray through the mattress.
    ['nightstand', 0.567, -2.6, 0.587, -2.6],
  ] as const) {
    await move(page, x, 0.015, z)
    await expect(page.getByTestId('attachment')).toHaveText('На полу')
    await expect(page.locator('footer .invalid')).toHaveCount(0)
    await page.screenshot({ path: `artifacts/036-near-${label}.png` })
    await move(page, insideX, 0.015, insideZ)
    await expect(page.locator('footer .invalid')).toBeVisible()
  }
  await page.keyboard.press('Escape')
})
