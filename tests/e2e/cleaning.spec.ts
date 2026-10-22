import { test, expect, type Page } from './support/legacy-test'
import { OrthographicCamera, Vector3 } from 'three'
import {
  initialTrash,
  bins,
  trashTypes,
  DISPOSAL_MS,
  type Trash,
} from '../../src/cleaning'
import { floorSupport } from '../../src/grounding'
import { initialItems } from '../../src/placement'
import { waitForCameraStill } from './support/camera'
const select = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()
const progress = (page: Page, room: string) =>
  page.getByTestId('cleaning-' + room)
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await page.keyboard.press('Tab')
}
async function point(page: Page, x: number, y: number, z: number) {
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
async function pick(page: Page, t: Trash, dx = 0) {
  const [w, , d] = trashTypes[t.kind].size
  const y = floorSupport({ ...t, w, d }, initialItems)
  const p = await point(page, t.x + dx, y + 0.12, t.z)
  await page.mouse.move(p.x, p.y)
  await page.mouse.click(p.x, p.y)
  await expect(page.locator('footer')).toContainText(
    'Подобрано: ' + trashTypes[t.kind].name,
  )
  await expect(page.getByRole('button', { name: /^Установить/ })).toHaveCount(0)
}
async function useBin(page: Page, index = 0) {
  const bin = bins[index],
    p = await point(page, bin.x, 0.3, bin.z)
  await page.mouse.click(p.x, p.y)
}

test('all four trash types have forgiving mouse targets, cancel safely and do not select furniture behind them', async ({
  page,
}) => {
  await open(page)
  for (const kind of ['paper', 'carton', 'wrapper', 'can'] as const) {
    const t = initialTrash.find((t) => t.kind === kind)!
    // Click beyond the visible small body, but within its half-metre picking target.
    await pick(page, t, kind === 'can' || kind === 'paper' ? 0.18 : 0)
    await expect(
      page.locator('.item-list button[aria-pressed="true"]'),
    ).toHaveCount(0)
    await expect(progress(page, 'living')).toContainText('0 / 5')
    await page.keyboard.press('Escape')
    await useBin(page)
    await page.waitForTimeout(DISPOSAL_MS + 30)
    await expect(progress(page, 'living')).toContainText('0 / 5')
  }
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await pick(page, initialTrash[0])
  await page.keyboard.press('Tab')
  await useBin(page)
  await expect(progress(page, 'living')).toContainText('0 / 5')
})

test('cleanup is animated, counts once, supports undo/redo, ignores disposed targets and persists on reload', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await pick(page, initialTrash[0])
  const before = await page.locator('canvas').screenshot()
  await useBin(page, 1) // Source room, not destination bin, owns progress.
  await expect(progress(page, 'living')).toContainText('0 / 5')
  await page.waitForTimeout(100)
  expect(before.equals(await page.locator('canvas').screenshot())).toBe(false)
  await useBin(page, 1)
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await expect(progress(page, 'bedroom')).toContainText('0 / 4')
  await useBin(page, 1)
  await expect(progress(page, 'living')).toContainText('1 / 5')
  const empty = await point(page, initialTrash[0].x, 0.12, initialTrash[0].z)
  await page.mouse.click(empty.x, empty.y)
  await useBin(page)
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await page.keyboard.press('Control+z')
  await expect(progress(page, 'living')).toContainText('0 / 5')
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await page.reload()
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await expect(progress(page, 'bedroom')).toContainText('0 / 4')
  expect(errors).toEqual([])
})

test('every initial piece is reachable in the scene; room completion only follows the last disposal', async ({
  page,
}) => {
  await open(page)
  for (const room of ['living', 'bedroom'] as const) {
    const trash = initialTrash.filter((t) => t.room === room)
    for (const [index, t] of trash.entries()) {
      await pick(page, t)
      await useBin(page, room === 'living' ? 0 : 1)
      await expect(progress(page, room)).toContainText(
        `${index + 1} / ${trash.length}`,
      )
      if (index + 1 < trash.length)
        await expect(page.locator('footer')).not.toContainText(
          'Комната очищена',
        )
    }
    await expect(page.locator('footer')).toContainText(
      'Комната очищена от мусора!',
    )
    if (room === 'living')
      await expect(progress(page, 'bedroom')).toContainText('0 / 4')
    await page.screenshot({ path: `artifacts/04-clean-${room}.png` })
  }
  await page.keyboard.press('Control+z')
  await expect(progress(page, 'bedroom')).toContainText('3 / 4')
  await page.keyboard.press('Control+Shift+z')
  await expect(progress(page, 'bedroom')).toContainText('4 / 4')
})

test('Esc and undo interrupt pending disposal without losing trash, late timers or duplicate progress', async ({
  page,
}) => {
  await open(page)
  await pick(page, initialTrash[0])
  await useBin(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(DISPOSAL_MS + 150)
  await expect(progress(page, 'living')).toContainText('0 / 5')
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await pick(page, initialTrash[0])
  await useBin(page)
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await pick(page, initialTrash[1])
  await useBin(page)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(DISPOSAL_MS + 150)
  await expect(progress(page, 'living')).toContainText('0 / 5')
  await page.keyboard.press('Control+y')
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await pick(page, initialTrash[1])
  await useBin(page)
  await expect(progress(page, 'living')).toContainText('2 / 5')
})

test('trash clicks never drag furniture, bins reject ordinary decor, camera and shared history stay usable', async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press('Tab')
  await select(page, 'Журнальный стол')
  const original = await page.getByTestId('pose').textContent()
  const p = await point(page, initialTrash[0].x, 0.12, initialTrash[0].z)
  await page.mouse.click(p.x, p.y)
  await expect(page.getByTestId('pose')).toHaveText(original!)
  await expect(page.getByRole('button', { name: /^Установить/ })).toHaveCount(0)
  await page.keyboard.press('Tab')
  await pick(page, initialTrash[0])
  const cameraBefore = await page.locator('canvas').getAttribute('data-camera')
  await page.keyboard.down('w')
  await page.waitForTimeout(200)
  await page.keyboard.up('w')
  expect(await page.locator('canvas').getAttribute('data-camera')).not.toBe(
    cameraBefore,
  )
  await page.keyboard.press('Home')
  await waitForCameraStill(page)
  await select(page, 'Чашка') // Selecting decor cancels trash selection.
  await useBin(page)
  await expect(progress(page, 'living')).toContainText('0 / 5')
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await page.keyboard.press('e')
  await useBin(page)
  await expect(page.getByRole('button', { name: /^Установить/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await pick(page, initialTrash[0])
  await useBin(page)
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await select(page, 'Торшер')
  await page.keyboard.press('e')
  await page.keyboard.press('Control+z')
  await expect(progress(page, 'living')).toContainText('1 / 5')
  await page.keyboard.press('Control+z')
  await expect(progress(page, 'living')).toContainText('0 / 5')
})

test('progress remains visible on a narrow screen without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.locator('.house-menu').evaluate((menu: HTMLDetailsElement) => {
    menu.open = false
  })
  await page.getByRole('button', { name: 'Открыть записку' }).click()
  await expect(page.getByTestId('task-trash-living')).toBeVisible()
  await expect(page.getByTestId('task-trash-bedroom')).toBeVisible()
  const note = (await page
    .getByRole('region', { name: 'Записка для нового хозяина' })
    .boundingBox())!
  expect(note.width).toBeLessThan(390)
  await expect(
    page.getByRole('button', { name: 'Закрыть записку' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({ path: 'artifacts/04-mobile-progress.png' })
})
