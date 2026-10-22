import { test, expect, type Page } from './support/legacy-test'
import { OrthographicCamera, Vector3 } from 'three'
import { dirtPatches, type DirtPatch } from '../../src/wiping'
import { initialTrash } from '../../src/cleaning'
import { waitForCameraStill } from './support/camera'

async function point(page: Page, x: number, z: number, y = 0.019) {
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
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: /^Взаимодействие/ }).click()
  await waitForCameraStill(page)
}
async function fraction(page: Page, patch = dirtPatches[0]) {
  return Number(
    await page
      .getByTestId('floor-' + patch.room)
      .textContent()
      .then((s) => s!.replace('%', '')),
  )
}
async function stroke(page: Page, patch: DirtPatch, z = 0, release = true) {
  const from = await point(page, patch.x - patch.w * 0.44, patch.z + z)
  const to = await point(page, patch.x + patch.w * 0.44, patch.z + z)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  if (release) await page.mouse.up()
}

test('real wiping is local, motion driven, persistent, cancellable and one history action per gesture', async ({
  page,
}) => {
  await open(page)
  const patch = dirtPatches[0],
    center = await point(page, patch.x, patch.z)
  await page.mouse.click(center.x, center.y)
  expect(await fraction(page)).toBe(0)
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.waitForTimeout(300)
  expect(await fraction(page)).toBe(0)
  await page.mouse.up()
  await stroke(page, patch)
  const partial = await fraction(page)
  expect(partial).toBeGreaterThan(15)
  expect(partial).toBeLessThan(80)
  expect(await fraction(page, dirtPatches[1])).toBe(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('floor-living')).toHaveText('0%')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('floor-living')).toHaveText(partial + '%')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  expect(await fraction(page)).toBe(partial)
  await stroke(page, patch, -0.2, false)
  expect(await fraction(page)).toBeGreaterThan(partial)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('floor-living')).toHaveText(partial + '%')
  await stroke(page, patch, 0.2, false)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.mouse.up()
  await expect(page.getByTestId('floor-living')).toHaveText(partial + '%')
  await page.reload()
  await expect(page.getByTestId('floor-living')).toHaveText(partial + '%')
})

test('both patches visibly erase along strokes, reach completion and restore with undo', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await open(page)
  await page.screenshot({ path: 'artifacts/05-initial-house.png' })
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await page.mouse.move(900, 500)
  // The responsive camera now permits a closer zoom. Keep this fixture near
  // the former 95px/m view so both floor patches remain inside the canvas.
  await page.mouse.wheel(0, -100)
  await waitForCameraStill(page)
  for (const patch of dirtPatches) {
    const center = await point(page, patch.x, patch.z)
    const clip = { x: center.x - 90, y: center.y - 60, width: 180, height: 120 }
    const before = await page.screenshot({
      path: `artifacts/05-${patch.room}-before.png`,
      clip,
    })
    await stroke(page, patch, -0.2, false)
    await page.screenshot({ path: `artifacts/05-${patch.room}-tool.png`, clip })
    await page.mouse.up()
    const partial = await fraction(page, patch)
    expect(partial).toBeGreaterThan(5)
    expect(partial).toBeLessThan(80)
    const first = await page.screenshot({
      path: `artifacts/05-${patch.room}-stroke.png`,
      clip,
    })
    expect(first.equals(before)).toBe(false)
    await stroke(page, patch, -0.07)
    expect(await fraction(page, patch)).toBeGreaterThan(partial)
    const half = await page.screenshot({
      path: `artifacts/05-${patch.room}-half.png`,
      clip,
    })
    expect(half.equals(first)).toBe(false)
    for (
      let pass = 0;
      pass < 2 && (await fraction(page, patch)) < 100;
      pass++
    ) {
      for (const z of [
        -0.3, -0.22, -0.14, -0.06, 0.02, 0.1, 0.18, 0.26, 0.32,
      ]) {
        await stroke(page, patch, z)
      }
    }
    await expect(page.getByTestId('floor-' + patch.room)).toHaveText('100%')
    await expect(page.getByRole('status')).toContainText('Поверхность очищена!')
    await page.waitForTimeout(350)
    const clean = await page.screenshot({
      path: `artifacts/05-${patch.room}-clean.png`,
      clip,
    })
    expect(clean.equals(half)).toBe(false)
    await page.keyboard.press('Control+z')
    expect(await fraction(page, patch)).toBeLessThan(100)
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('floor-' + patch.room)).toHaveText('100%')
  }
  await expect(page.getByTestId('cleaning-living')).toContainText('0 / 5')
  await expect(page.getByTestId('cleaning-bedroom')).toContainText('0 / 4')
  expect(errors).toEqual([])
})

test('release outside stops wiping; mode and focus changes cancel without stuck input', async ({
  page,
}) => {
  await open(page)
  await stroke(page, dirtPatches[0], 0, false)
  await page.mouse.move(20, 20)
  await page.mouse.up()
  const partial = await fraction(page)
  expect(partial).toBeGreaterThan(0)
  const p = await point(page, dirtPatches[0].x, dirtPatches[0].z + 0.2)
  await page.mouse.move(p.x, p.y)
  expect(await fraction(page)).toBe(partial)
  await stroke(page, dirtPatches[0], -0.2, false)
  await page.keyboard.press('Tab')
  await page.mouse.up()
  await expect(page.getByTestId('floor-living')).toHaveText(partial + '%')
  const camera = await page.locator('canvas').getAttribute('data-camera')
  await page.keyboard.down('w')
  await page.waitForTimeout(200)
  await page.keyboard.up('w')
  expect(await page.locator('canvas').getAttribute('data-camera')).not.toBe(
    camera,
  )
})

test('surface gestures do not interfere with quick or classic trash cleanup', async ({
  page,
}) => {
  await open(page)
  await stroke(page, dirtPatches[0])
  const before = await fraction(page)
  const t = initialTrash[0],
    p = await point(page, t.x, t.z, 0.12)
  await page.keyboard.down('Shift')
  await page.mouse.click(p.x, p.y)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('cleaning-living')).toContainText('1 / 5')
  expect(await fraction(page)).toBe(before)
  const second = initialTrash[1],
    p2 = await point(page, second.x, second.z, 0.1)
  await page.mouse.click(p2.x, p2.y)
  const bin = await point(page, -4.45, 2.75, 0.3)
  await page.mouse.click(bin.x, bin.y)
  await expect(page.getByTestId('cleaning-living')).toContainText('2 / 5')
  expect(await fraction(page)).toBe(before)
})

test('both initial patches are reachable with walls present; fast exit and rotated-camera strokes stay local', async ({
  page,
}) => {
  await open(page)
  for (const patch of dirtPatches) {
    await stroke(page, patch)
    expect(await fraction(page, patch)).toBeGreaterThan(15)
  }
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  const patch = dirtPatches[0]
  const from = await point(page, patch.x + 0.2, patch.z)
  const outside = await point(page, patch.x - 0.7, patch.z)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // One pointer event crosses the entire patch and exits onto the floor.
  await page.mouse.move(outside.x, outside.y)
  await page.mouse.up()
  expect(await fraction(page)).toBeGreaterThan(35)
  const before = await fraction(page)
  await page.mouse.move(900, 500)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1000, 460, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await waitForCameraStill(page)
  expect(await fraction(page)).toBe(before)
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await stroke(page, patch, -0.2)
  expect(await fraction(page)).toBeGreaterThan(before)
  await expect(page.getByRole('button', { name: /^Установить/ })).toHaveCount(0)
})

test('all dirt is reachable before moving furniture; a rug can cover partial dirt without resetting it', async ({
  page,
}) => {
  await open(page)
  await stroke(page, dirtPatches[0])
  const partial = await fraction(page)
  await page.keyboard.press('Tab')
  await page
    .getByRole('button', { name: 'Ковёр гостиной', exact: true })
    .click()
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  const destination = await point(page, -2.7, 1.5, 0)
  await page.mouse.click(destination.x, destination.y)
  await expect(page.getByRole('button', { name: /^Установить/ })).toHaveCount(0)
  expect(await fraction(page)).toBe(partial)
  await page.keyboard.press('Control+z')
  expect(await fraction(page)).toBe(partial)
  await page.keyboard.press('Tab')
  for (const patch of dirtPatches) {
    for (const z of [-0.26, -0.18, -0.1, -0.02, 0.06, 0.14, 0.22, 0.28]) {
      await stroke(page, patch, z)
    }
    await expect(page.getByTestId('floor-' + patch.room)).toHaveText('100%')
  }
})
