import { test, expect, type Page } from '@playwright/test'
import { world, clickWorld } from './support/world'
import {
  floorSamplePositions,
  floorSampleArea,
  toolPositions,
} from '../../src/workArea'
import {
  floorCells,
  floorMaterials,
  type FloorMaterial,
} from '../../src/flooring'
import type { Room } from '../../src/cleaning'
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const e: string[] = []
  errors.set(page, e)
  page.on('pageerror', (x) => e.push(x.message))
  page.on('console', (m) => {
    if (m.type() === 'error') e.push(m.text())
  })
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
}
async function choose(page: Page, m: FloorMaterial) {
  const p = floorSamplePositions[m]
  await clickWorld(page, p[0], p[1], p[2])
  await expect(
    page.locator('.tool-context').filter({ visible: true }),
  ).toContainText(floorMaterials[m].name)
}
async function state(page: Page, room: Room = 'living') {
  return JSON.parse(
    (await page.locator('canvas').getAttribute('data-flooring'))!,
  ).find((f: any) => f.room === room)
}
async function move(page: Page, x: number, z: number, steps = 1) {
  const p = await world(page, x, 0.017, z)
  await page.mouse.move(p.x, p.y, { steps })
}
async function stroke(
  page: Page,
  x: number,
  z: number,
  x2: number,
  z2: number,
  steps = 1,
) {
  await move(page, x, z)
  await page.mouse.down()
  await move(page, x2, z2, steps)
  await page.mouse.up()
}
for (const [width, height] of [
  [1920, 1080],
  [1280, 720],
  [800, 600],
  [390, 844],
])
  test('floor samples are safe and clickable ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await open(page)
    for (const m of ['oak', 'walnut', 'tile'] as FloorMaterial[]) {
      const [x, y, z] = floorSamplePositions[m]
      for (const [dx, dz] of [
        [-0.4, -0.2],
        [0.4, 0.2],
      ]) {
        const p = await world(page, x + dx, y, z + dz)
        expect(p.x).toBeGreaterThan(5)
        expect(p.x).toBeLessThan(width - 5)
        expect(p.y).toBeGreaterThan(5)
        expect(p.y).toBeLessThan(height - 5)
      }
      await choose(page, m)
      await clickWorld(page, x, y, z)
    }
    const [px, py, pz] = floorSampleArea.position,
      [pw, ph, pd] = floorSampleArea.size
    for (const [dx, dz] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const q = await world(
        page,
        px + (dx * pw) / 2,
        py + ph / 2,
        pz + (dz * pd) / 2,
      )
      expect(q.x).toBeGreaterThan(3)
      expect(q.x).toBeLessThan(width - 3)
      expect(q.y).toBeGreaterThan(3)
      expect(q.y).toBeLessThan(height - 3)
    }
    await expect(
      page.locator('.tool-context').filter({ visible: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Открыть записку' }).click()
    await expect(page.getByTestId('task-replace-living')).toContainText('0%')
    await page.getByRole('button', { name: 'Закрыть записку' }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'artifacts/07/samples-' + width + '.png' })
  })
test('whole planks follow fast drags, hold is inert, repeat/undo/redo/Esc/blur preserve state and old interactions', async ({
  page,
}) => {
  await open(page)
  await page.screenshot({ path: 'artifacts/07/original.png' })
  await choose(page, 'walnut')
  await move(page, -3.1, 2.65)
  await page.mouse.down()
  await page.waitForTimeout(200)
  await page.mouse.up()
  expect((await state(page)).laid).toBe(0)
  await stroke(page, -3.7, 2.65, -1.8, 2.65, 8)
  const first = await state(page)
  expect(first.laid).toBeGreaterThan(0)
  expect(first.progress).toBeLessThan(0.3)
  await page.screenshot({ path: 'artifacts/07/first-planks.png' })
  await stroke(page, -3.7, 2.65, -1.8, 2.65)
  expect(await state(page)).toEqual(first)
  await page.keyboard.press('Control+z')
  expect((await state(page)).laid).toBe(0)
  await page.keyboard.press('Control+y')
  expect(await state(page)).toEqual(first)
  await move(page, -3.7, 2.1)
  await page.mouse.down()
  await move(page, -1.8, 2.1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await state(page)).toEqual(first)
  await choose(page, 'walnut')
  await move(page, -3.7, 2.1)
  await page.mouse.down()
  await move(page, -1.8, 2.1)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.mouse.up()
  expect(await state(page)).toEqual(first)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Открыть записку' }).click()
  await expect(page.getByTestId('task-replace-living')).not.toContainText('0%')
  await page.getByRole('button', { name: 'Закрыть записку' }).click()
  await page.keyboard.press('KeyW')
  expect(await state(page)).toEqual(first)
  await page.reload()
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  expect(await state(page)).toEqual(first)
})
test('conflicting material requires an explicit undoable reset and rooms stay independent', async ({
  page,
}) => {
  await open(page)
  await choose(page, 'oak')
  await stroke(page, -3.7, 2.65, -1.8, 2.65)
  const old = await state(page)
  await choose(page, 'tile')
  await stroke(page, -3.7, 2.65, -1.8, 2.65)
  await expect(
    page.getByRole('button', { name: 'Сбросить укладку' }),
  ).toBeVisible()
  expect(await state(page)).toEqual(old)
  await page.getByRole('button', { name: 'Оставить покрытие' }).click()
  expect(await state(page)).toEqual(old)
  await stroke(page, -3.7, 2.65, -1.8, 2.65)
  await page.getByRole('button', { name: 'Сбросить укладку' }).click()
  expect((await state(page)).material).toBeNull()
  await page.keyboard.press('Control+z')
  expect(await state(page)).toEqual(old)
  await page.keyboard.press('Control+y')
  await stroke(page, -3.7, 2.65, -1.8, 2.65)
  expect((await state(page)).material).toBe('tile')
  expect((await state(page, 'bedroom')).laid).toBe(0)
  await page.screenshot({ path: 'artifacts/07/tiles.png' })
  const final = await state(page)
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'data-status',
    'saved',
  )
  await page.reload()
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  expect(await state(page)).toEqual(final)
})
for (const angle of [0, 110])
  test(
    'both real rooms complete without moving furniture, different materials and dirty areas remain independent ' +
      angle,
    async ({ page }) => {
      test.setTimeout(180000)
      await open(page)
      for (const [room, material] of [
        ['living', 'tile'],
        ['bedroom', 'oak'],
      ] as [Room, FloorMaterial][]) {
        await choose(page, material)
        // A higher camera angle reveals the available floor, without moving any item.
        await page.mouse.move(720, 500)
        await page.mouse.down({ button: 'middle' })
        await page.mouse.move(720 + angle, 750, { steps: 12 })
        await page.mouse.up({ button: 'middle' })
        await page.waitForTimeout(150)
        let captured = false
        for (
          let row = 0;
          row < 28 && !(await state(page, room)).complete;
          row++
        ) {
          const z = -3.25 + row * 0.245
          for (let col = 0; col < 21; col++) {
            const x = (room === 'living' ? -4.8 : 0.23) + col * 0.23
            await move(page, x, z)
            if (col === 0) await page.mouse.down()
          }
          await page.mouse.up()
          const f = await state(page, room)
          if (!captured && f.progress >= 0.4) {
            captured = true
            await page.screenshot({
              path: 'artifacts/07/half-' + room + '.png',
            })
          }
        }
        for (const cell of floorCells(room, material)) {
          if ((await state(page, room)).complete) break
          await stroke(page, cell.x - 0.01, cell.z, cell.x + 0.01, cell.z)
        }
        console.log(room, await state(page, room))
        expect((await state(page, room)).complete).toBe(true)
        await expect(page.locator('footer')).toContainText('Пол обновлён!')
        await page.screenshot({
          path: 'artifacts/07/complete-' + room + '.png',
        })
        await page.keyboard.press('Control+z')
        expect((await state(page, room)).complete).toBe(false)
        await page.keyboard.press('Control+y')
        expect((await state(page, room)).complete).toBe(true)
        await page.keyboard.press('Escape')
        await page.keyboard.press('Home')
        await page.waitForTimeout(150)
      }
      await page.getByRole('button', { name: 'Открыть записку' }).click()
      for (const room of ['living', 'bedroom']) {
        await expect(page.getByTestId('task-replace-' + room)).toContainText(
          '☑',
        )
        await expect(page.getByTestId('task-floor-' + room)).toContainText('0%')
      }
      await page.getByRole('button', { name: 'Закрыть записку' }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'artifacts/07/two-materials.png' })
      const floorBefore = await state(page)
      await page.locator('.house-menu summary').click()
      await page
        .getByRole('button', { name: 'Ковёр гостиной', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Переместить', exact: true })
        .click()
      await clickWorld(page, -2.2, 0, 1.5)
      await expect(page.getByTestId('pose')).toContainText('Z 1.50')
      await page.locator('.house-menu summary').click()
      expect(await state(page)).toEqual(floorBefore)
      await page.screenshot({ path: 'artifacts/07/rug-moved.png' })
      await page.keyboard.press('Control+z')
      await expect(page.getByTestId('pose')).toContainText('Z -0.10')
      await page.keyboard.press('Control+y')
      await expect(page.getByTestId('pose')).toContainText('Z 1.50')
      expect(await state(page)).toEqual(floorBefore)
      await expect(page.getByTestId('save-status')).toHaveAttribute(
        'data-status',
        'saved',
      )
      await page.reload()
      await expect(page.locator('canvas')).toHaveAttribute(
        'data-scene-ready',
        'true',
      )
      expect(await state(page)).toEqual(floorBefore)
      expect((await state(page, 'bedroom')).complete).toBe(true)
    },
  )

test('new covering stays below dirt; wiping, painting, trash and mixed history preserve installed cells', async ({
  page,
}) => {
  await open(page)
  await choose(page, 'oak')
  await stroke(page, -3.7, 2.45, -2.7, 2.45, 8)
  const floor = await state(page)
  expect(floor.laid).toBeGreaterThan(0)
  let p: readonly [number, number, number] = toolPositions.sponge
  await clickWorld(page, p[0], p[1], p[2])
  await stroke(page, -3.55, 2.45, -2.75, 2.45, 12)
  await expect(page.getByTestId('active-tool-progress')).not.toHaveText('0%')
  expect(await state(page)).toEqual(floor)
  p = toolPositions.roller
  await clickWorld(page, p[0], p[1], p[2])
  const a = await world(page, -4.902, 2.25, 1),
    b = await world(page, -4.902, 2.25, -1)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByTestId('active-tool-progress')).not.toHaveText('0%')
  expect(await state(page)).toEqual(floor)
  await page.keyboard.press('Escape')
  await page.keyboard.down('Shift')
  await clickWorld(page, -2.1, 0.04, 2.65)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('task-trash-living')).toContainText('1 / 5')
  expect(await state(page)).toEqual(floor)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('task-trash-living')).toContainText('0 / 5')
  expect(await state(page)).toEqual(floor)
  await page.keyboard.press('Control+y')
  expect(await state(page)).toEqual(floor)
  await choose(page, 'oak')
  await stroke(page, -1.8, 1.9, -0.5, 1.9, 8)
  expect((await state(page)).laid).toBeGreaterThan(floor.laid)
  expect((await state(page)).material).toBe('oak')
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'artifacts/07/dirt-and-new-floor.png' })
})
