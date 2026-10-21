import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'
import { initialItems, itemName } from '../../src/placement'

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
async function pose(page: Page) {
  const values = (await page.getByTestId('pose').innerText())
    .match(/-?\d+(?:\.\d+)?/g)!
    .map(Number)
  return { x: values[0], z: values[1], angle: values[2] }
}
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
}
async function pointer(page: Page, x: number, z: number, y = 0.59) {
  const p = await project(page, x, y, z)
  await page.mouse.move(p.x, p.y, { steps: 5 })
}
test('a grabbed object can rotate before the first mouse move and commit on release', async ({
  page,
}) => {
  await open(page)
  await pointer(page, -2.35, -0.5)
  await page.mouse.down()
  await page.keyboard.press('r')
  await expect.poll(async () => (await pose(page)).angle).toBe(352.5)
  const turned = await pose(page)
  expect(turned.x).toBe(-2.8)
  expect(turned.z).toBe(-0.4)
  await page.mouse.up()
  expect(await pose(page)).toEqual(turned)
  await page.keyboard.press('Control+z')
  expect(await pose(page)).toEqual({ x: -2.8, z: -0.4, angle: 0 })
})
for (const key of ['q', 'r'])
  test(`held ${key} and real mouse drag update coordinates and angle together, then keep dragging and undo once`, async ({
    page,
  }) => {
    await open(page)
    // Bare tabletop away from book/cup, deliberately not the centre grab point.
    await pointer(page, -2.35, -0.5)
    await page.mouse.down()
    await expect(page.getByTestId('pose')).toContainText('X -2.80')
    await page.keyboard.down(key)
    let previous = await pose(page)
    for (const dx of [0.15, 0.35, 0.6, 0.8]) {
      await pointer(page, -2.35 + dx, -0.5 + dx / 3)
      await page.waitForTimeout(110)
      const current = await pose(page)
      expect(current.x).toBeCloseTo(-2.8 + dx, 1)
      expect(current.z).toBeCloseTo(-0.4 + dx / 3, 1)
      expect(current.angle).not.toBe(previous.angle)
      previous = current
    }
    await page.keyboard.up(key)
    const stopped = await pose(page)
    await page.waitForTimeout(180)
    expect(await pose(page)).toEqual(stopped)
    await pointer(page, -1.45, -0.15)
    const final = await pose(page)
    expect(final.x).toBeGreaterThan(stopped.x)
    expect(final.angle).toBe(stopped.angle)
    await page.mouse.up()
    await expect(page.locator('footer')).toContainText('Предмет размещён')
    await page.keyboard.press('Control+z')
    expect(await pose(page)).toEqual({ x: -2.8, z: -0.4, angle: 0 })
    await page.keyboard.press('Control+y')
    expect(await pose(page)).toEqual(final)
    for (const [name, x, z] of [
      ['Книга', -0.27, -0.15],
      ['Чашка', 0.34, 0.13],
    ] as const) {
      await page.getByRole('button', { name, exact: true }).click()
      const child = await pose(page)
      const a = (final.angle * Math.PI) / 180
      expect(child.x).toBeCloseTo(
        final.x + Math.cos(a) * x + Math.sin(a) * z,
        1,
      )
      expect(child.z).toBeCloseTo(
        final.z - Math.sin(a) * x + Math.cos(a) * z,
        1,
      )
    }
  })

for (const id of [
  'sofa',
  'chair',
  'bed',
  'table',
  'cabinet',
  'nightstand',
  'rug',
  'bin-living',
]) {
  const item = initialItems.find((i) => i.id === id)!
  test(`pointer placement and rotation share a live pose for ${id}, including invalid previews and cancellation`, async ({
    page,
  }) => {
    await open(page)
    await page
      .getByRole('button', { name: itemName(item), exact: true })
      .click()
    const original = await pose(page)
    await page.getByRole('button', { name: 'Переместить', exact: true }).click()
    await pointer(page, item.x + 0.12, item.z + 0.1, 0)
    await page.keyboard.down('r')
    for (const dx of [0.2, 0.35, 0.5]) {
      await pointer(page, item.x + dx, item.z + 0.15, 0)
      await page.waitForTimeout(80)
      expect((await pose(page)).x).toBeCloseTo(item.x + dx, 1)
    }
    await page.keyboard.up('r')
    const turned = await pose(page)
    expect(turned.angle).not.toBe(original.angle)
    await pointer(page, item.x + 0.6, item.z + 0.15, 0)
    expect((await pose(page)).angle).toBe(turned.angle)
    await page.keyboard.press('Escape')
    await page
      .getByRole('button', { name: itemName(item), exact: true })
      .click()
    expect(await pose(page)).toEqual(original)
  })
}

test('red wall/furniture previews allow movement and Q to R reversal; drop restores a full valid pose', async ({
  page,
}) => {
  await open(page)
  await pointer(page, -2.35, -0.5)
  await page.mouse.down()
  await pointer(page, -2.1, -0.35)
  await page.keyboard.down('q')
  await page.waitForTimeout(180)
  await pointer(page, -4.8, -3.3)
  await expect(page.locator('footer .invalid')).toHaveCount(1)
  await page.keyboard.up('q')
  await page.keyboard.down('r')
  await pointer(page, -2.1, -0.25)
  await page.waitForTimeout(180)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  await page.keyboard.up('r')
  const lastValid = await pose(page)
  await pointer(page, -4.8, -3.3)
  await expect(page.locator('footer .invalid')).toHaveCount(1)
  await page.mouse.up()
  await expect(page.locator('footer')).toContainText('последнюю допустимую')
  // Intermediate pointer samples can also be valid: final pose must be valid,
  // preserve the stopped angle, and undo the complete gesture in one step.
  expect((await pose(page)).angle).toBe(lastValid.angle)
  await expect(page.locator('footer .invalid')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  expect(await pose(page)).toEqual({ x: -2.8, z: -0.4, angle: 0 })
})
