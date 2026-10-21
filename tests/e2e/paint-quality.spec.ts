import { test, expect, type Page } from '@playwright/test'
import { world, clickWorld } from './support/world'
import { paintWalls, wallWorld, type PaintWall } from '../../src/painting'
import { toolPositions } from '../../src/WorkTools'
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []
  errors.set(page, list)
  page.on('pageerror', (e) => list.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text())
  })
})
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})
const folder = process.env.PAINT_CAPTURE_BASELINE
  ? 'artifacts/062-before'
  : 'artifacts/062-after'
async function move(page: Page, w: PaintWall, u: number, v: number, steps = 1) {
  const p = wallWorld(w, { x: u, y: v })
  const q = await world(page, p.x, p.y, p.z)
  await page.mouse.move(q.x, q.y, { steps })
}
async function stroke(page: Page, w: PaintWall, v: number, steps = 1) {
  await move(page, w, -w.w / 2 + 0.08, v)
  await page.mouse.down()
  await move(page, w, w.w / 2 - 0.02, v, steps)
  await page.mouse.up()
}
const percent = async (page: Page) =>
  Number(
    (await page.getByTestId('active-tool-progress').textContent())!.replace(
      '%',
      '',
    ),
  )
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
}
async function tool(page: Page, id: keyof typeof toolPositions) {
  const p = toolPositions[id]
  await clickWorld(page, p[0], p[1], p[2])
}
for (const id of ['wall-living', 'wall-bedroom'])
  test('quality stages of large ' + id, async ({ page }) => {
    test.setTimeout(60000)
    await open(page)
    if (id === 'wall-living') {
      await page.locator('.house-menu summary').click()
      await page
        .getByRole('button', { name: 'Мягкое кресло', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Переместить', exact: true })
        .click()
      await clickWorld(page, -1.2, 0, 2.3)
      await expect(page.getByTestId('pose')).toContainText('X -1.20')
      await page.locator('.house-menu summary').click()
    }
    await tool(page, 'roller')
    await tool(page, 'terracotta')
    const w = paintWalls.find((w) => w.id === id)!
    await page.mouse.move(30, 700)
    await page.screenshot({ path: folder + '/' + id + '-0.png' })
    const stages = new Set<number>()
    const values: number[] = []
    for (let n = 0; n < 32 && (await percent(page)) < 100; n++) {
      const v = Math.max(-w.h / 2 + 0.02, w.h / 2 - 0.02 - n * 0.1)
      await stroke(page, w, v, n % 2 ? 1 : 16)
      const value = await percent(page)
      values.push(value)
      const stage =
        value >= 10 && value <= 20
          ? 15
          : value >= 45 && value <= 58
            ? 50
            : value >= 86 && value < 95
              ? 90
              : value === 100
                ? 100
                : 0
      if (stage && !stages.has(stage)) {
        stages.add(stage)
        await page.mouse.move(30, 700)
        await page.screenshot({
          path: folder + '/' + id + '-' + stage + '.png',
        })
      }
    }
    expect(await percent(page), JSON.stringify(values)).toBe(100)
    expect([...stages]).toContain(15)
    expect([...stages]).toContain(50)
    expect([...stages]).toContain(90)
    await page.keyboard.press('Control+z')
    expect(await percent(page)).toBeLessThan(100)
    await page.keyboard.press('Control+y')
    expect(await percent(page)).toBe(100)
  })

test('fast diagonals and slowly sampled strokes remain continuous and repeat without darkening', async ({
  page,
}) => {
  await open(page)
  await tool(page, 'roller')
  await tool(page, 'terracotta')
  const w = paintWalls[0]
  await move(page, w, -2.7, 0.35)
  await page.mouse.down()
  await move(page, w, 2.7, 1.15)
  await page.mouse.up()
  const a = await percent(page)
  expect(a).toBeGreaterThan(0)
  await page.mouse.move(30, 700)
  await page.screenshot({ path: folder + '/diagonal.png' })
  await move(page, w, -2.7, 0.35)
  await page.mouse.down()
  await move(page, w, 2.7, 1.15, 30)
  await page.mouse.up()
  expect(await percent(page)).toBe(a)
  await page.mouse.move(30, 700)
  await page.screenshot({ path: folder + '/diagonal-repeat.png' })
})

for (const [width, height] of [
  [1920, 1080],
  [390, 844],
])
  test(
    'organized work area stays safely framed and every object is selectable ' +
      width,
    async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page)
      const { toolFootprints, workArea } = await import('../../src/workArea')
      for (const id of Object.keys(
        toolPositions,
      ) as (keyof typeof toolPositions)[]) {
        const [x, , z] = toolPositions[id],
          f = toolFootprints[id]
        for (const [px, pz] of [
          [x - f.left, z - f.back],
          [x + f.right, z + f.front],
          [x - f.left, z + f.front],
          [x + f.right, z - f.back],
        ]) {
          const q = await world(page, px, -0.21, pz)
          expect(q.x).toBeGreaterThan(12)
          expect(q.x).toBeLessThan(width - 12)
          expect(q.y).toBeGreaterThan(12)
          expect(q.y).toBeLessThan(height - 12)
        }
      }
      for (const id of ['roller', 'sponge'] as const) {
        await tool(page, id)
        await expect(page.locator('.tool-context')).toContainText(
          id === 'roller' ? 'Валик' : 'Губка',
        )
        await tool(page, id)
        await expect(page.locator('.tool-context')).toBeHidden()
      }
      await tool(page, 'roller')
      for (const id of ['cream', 'sage', 'terracotta'] as const) {
        await tool(page, id)
        const { paintColors } = await import('../../src/painting')
        await expect(page.locator('footer')).toContainText(paintColors[id].name)
      }
      await page.mouse.move(width - 30, height - 30)
      await page.screenshot({ path: folder + '/tools-' + width + '.png' })
      const [x, , z] = workArea.position,
        [w, , d] = workArea.size
      for (const [px, pz] of [
        [x - w / 2, z - d / 2],
        [x - w / 2, z + d / 2],
        [x + w / 2, z + d / 2],
      ]) {
        const q = await world(page, px, -0.21, pz)
        expect(q.x).toBeGreaterThan(4)
        expect(q.x).toBeLessThan(width - 4)
      }
    },
  )
