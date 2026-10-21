import { quarterTurn, buttonQuarterTurn } from './support/rotation'
import { test, expect, type Page } from './support/legacy-test'
import { OrthographicCamera, Vector3 } from 'three'
import {
  initialTrash,
  bins,
  DISPOSAL_MS,
  trashTypes,
  type Trash,
} from '../../src/cleaning'
import { initialItems } from '../../src/placement'
import { floorSupport } from '../../src/grounding'
const select = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()
const progress = (page: Page, room = 'living') =>
  page.getByTestId('cleaning-' + room)
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
    s = JSON.parse((await page.locator('canvas').getAttribute('data-camera'))!)
  const c = new OrthographicCamera(
    -b.width / 2,
    b.width / 2,
    b.height / 2,
    -b.height / 2,
    0.1,
    250,
  )
  c.position.fromArray(s.position)
  c.lookAt(new Vector3().fromArray(s.target))
  c.zoom = s.zoom
  c.updateProjectionMatrix()
  c.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(c)
  return {
    x: b.x + ((p.x + 1) * b.width) / 2,
    y: b.y + ((1 - p.y) * b.height) / 2,
  }
}
async function click(
  page: Page,
  x: number,
  y: number,
  z: number,
  quick = false,
) {
  const p = await point(page, x, y, z)
  await page.mouse.move(p.x, p.y)
  if (quick) await page.keyboard.down('Shift')
  await page.mouse.click(p.x, p.y)
  if (quick) await page.keyboard.up('Shift')
}
async function quick(page: Page, t: Trash) {
  const [w, , d] = trashTypes[t.kind].size
  await click(
    page,
    t.x,
    floorSupport({ ...t, w, d }, initialItems) + 0.12,
    t.z,
    true,
  )
  await expect
    .poll(async () => (await flight(page))?.id, { intervals: [16] })
    .toBe(t.id)
}
async function drag(
  page: Page,
  from: [number, number, number],
  to: [number, number, number],
) {
  const a = await point(page, ...from),
    b = await point(page, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 12 })
}
async function flight(page: Page) {
  const raw = await page.locator('canvas').getAttribute('data-flight')
  return raw
    ? (JSON.parse(raw) as {
        id: string
        binId: string
        t: number
        position: number[]
        destination: number[]
        scale: number
        visible: boolean
      })
    : null
}

test('both bins drag with the standard preview, remain in their room and keep rotation and undo/redo', async ({
  page,
}) => {
  await open(page)
  for (const [index, name, x] of [
    [0, 'Ведро гостиной', -1],
    [1, 'Ведро спальни', 1],
  ] as const) {
    const bin = bins[index]
    await select(page, name)
    const original = await page.getByTestId('pose').textContent()
    await drag(page, [bin.x, 0.3, bin.z], [x, 0.3, 0])
    await expect(page.locator('footer .invalid')).toHaveCount(0)
    await quarterTurn(page, 1)
    await page.mouse.up()
    await expect(page.getByTestId('pose')).toHaveText(
      `X ${x.toFixed(2)} · Z 0.00 · 90°`,
    )
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('pose')).toHaveText(original!)
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('pose')).toContainText('90°')
    await select(page, 'Переместить')
    await click(page, -x, 0, 0)
    await expect(page.locator('footer .invalid')).toContainText('своей комнате')
    await page.keyboard.press('Escape')
    await select(page, name)
    await expect(page.getByTestId('pose')).toContainText(`X ${x.toFixed(2)}`)
    await select(page, 'Переместить')
    await click(page, index === 0 ? -2.8 : 2.8, 0, index === 0 ? -0.4 : -1.65)
    await expect(page.locator('footer .invalid')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(progress(page)).toContainText('0 / 5')
  }
})

test('ordinary cleanup flies visibly to a relocated bin, enters it, and shares history with the move', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Ведро гостиной')
  await select(page, 'Переместить')
  await click(page, -1, 0, 0)
  await page.keyboard.press('Tab')
  const trash = initialTrash[0]
  await click(page, trash.x, 0.13, trash.z)
  await expect(page.locator('footer')).toContainText('Подобрано')
  await click(page, -1, 0.3, 0)
  await expect
    .poll(async () => (await flight(page))?.t ?? 0, { intervals: [16] })
    .toBeGreaterThan(0.15)
  const mid = (await flight(page))!
  expect(mid.binId).toBe('bin-living')
  expect(mid.destination[0]).toBe(-1)
  expect(mid.destination[2]).toBe(0)
  expect(mid.position[0]).toBeGreaterThan(trash.x)
  expect(mid.position[0]).toBeLessThan(-1)
  expect(mid.position[1]).toBeGreaterThan(0.15)
  expect(mid.scale).toBe(1)
  expect(mid.visible).toBe(true)
  await expect(progress(page)).toContainText('0 / 5')
  await page.screenshot({ path: 'artifacts/041-flight-relocated-mid.png' })
  await expect(progress(page)).toContainText('1 / 5')
  await expect(page.locator('canvas')).not.toHaveAttribute('data-flight')
  await page.keyboard.press('Control+z')
  await expect(progress(page)).toContainText('0 / 5')
  await page.keyboard.press('Control+z')
  await select(page, 'Ведро гостиной')
  await expect(page.getByTestId('pose')).toHaveText('X -4.45 · Z 2.75 · 0°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText('X -1.00 · Z 0.00 · 0°')
  await page.keyboard.press('Control+y')
  await expect(progress(page)).toContainText('1 / 5')
})

test('Shift click cleans every trash kind in both modes, and repeated clicks cannot cancel or duplicate the flight', async ({
  page,
}) => {
  await open(page)
  for (const [index, kind] of (
    ['paper', 'carton', 'wrapper', 'can'] as const
  ).entries()) {
    if (index === 2) await page.keyboard.press('Tab')
    const t = initialTrash.find((t) => t.kind === kind)!
    await quick(page, t)
    await page.keyboard.down('Shift')
    const original = await point(page, t.x, 0.13, t.z)
    await page.mouse.click(original.x, original.y)
    await page.keyboard.up('Shift')
    const active = await flight(page)
    expect(active?.id).toBe(t.id)
    expect(active?.binId).toBe('bin-living')
    await expect(progress(page)).toContainText(`${index} / 5`)
    await expect(progress(page)).toContainText(`${index + 1} / 5`)
    await expect(progress(page, 'bedroom')).toContainText('0 / 4')
  }
  await expect(page.locator('.item-list button')).toHaveCount(15)
})

test('Shift click on furniture and ordinary decor never deletes them or changes cleanup progress', async ({
  page,
}) => {
  await open(page)
  await click(page, -2.8, 0.59, -0.4, true)
  await expect(page.getByTestId('pose')).toHaveText('X -2.80 · Z -0.40 · 0°')
  await page.keyboard.press('Tab')
  await click(page, -2.46, 0.69, -0.27, true)
  await page.keyboard.press('Escape')
  await select(page, 'Чашка')
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await expect(progress(page)).toContainText('0 / 5')
  await expect(page.locator('.item-list button')).toHaveCount(15)
  expect(await flight(page)).toBeNull()
})

test('receiving bin is locked until landing, while Esc restores the trash and allows a fresh quick cleanup', async ({
  page,
}) => {
  await open(page)
  await quick(page, initialTrash[0])
  await select(page, 'Ведро гостиной')
  await expect(page.locator('footer')).toContainText('Ведро принимает мусор')
  await expect(
    page.locator('.item-list button[aria-pressed="true"]'),
  ).toHaveCount(0)
  await drag(page, [-4.45, 0.3, 2.75], [-3.8, 0.3, 2.65])
  await page.mouse.up()
  await page.keyboard.press('Escape')
  await expect(page.locator('canvas')).not.toHaveAttribute('data-flight')
  await page.waitForTimeout(DISPOSAL_MS + 80)
  await expect(progress(page)).toContainText('0 / 5')
  await select(page, 'Ведро гостиной')
  await expect(page.getByTestId('pose')).toHaveText('X -4.45 · Z 2.75 · 0°')
  await select(page, 'Переместить')
  await click(page, -1, 0, 0)
  await quick(page, initialTrash[0])
  await expect(progress(page)).toContainText('1 / 5')
  await select(page, 'Ведро гостиной')
  await expect(page.getByTestId('pose')).toHaveText('X -1.00 · Z 0.00 · 0°')
})

test('quick cleanup uses the moved bedroom bin and flight remains visible during mouse orbit', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Ведро спальни')
  await select(page, 'Переместить')
  await click(page, 1, 0, 0)
  await quick(
    page,
    initialTrash.find((t) => t.room === 'bedroom')!,
  )
  const first = (await flight(page))!
  expect(first.destination[0]).toBe(1)
  expect(first.destination[2]).toBe(0)
  await page.mouse.move(980, 650)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1080, 610, { steps: 5 })
  await page.mouse.up({ button: 'middle' })
  const middle = await flight(page)
  expect(middle?.id).toBe(first.id)
  expect(middle!.t).toBeGreaterThan(first.t)
  expect(middle!.visible).toBe(true)
  await page.screenshot({ path: 'artifacts/041-flight-orbit.png' })
  await expect(progress(page, 'bedroom')).toContainText('1 / 4')
  await expect(progress(page)).toContainText('0 / 5')
})
