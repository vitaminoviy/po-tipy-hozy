import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

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
for (const key of [null, 'q', 'r'])
  test(`rapid real mouse reversals and diagonals ${key ?? 'without rotation'} keep the latest pose and one history action`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await open(page)
    await pointer(page, -2.35, -0.5)
    await page.mouse.down()
    await pointer(page, -2.15, -0.5)
    await expect.poll(async () => (await pose(page)).x).toBeCloseTo(-2.6, 1)
    if (key) await page.keyboard.down(key)
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const [dx, dz] of [
        [0.6, 0.2],
        [-0.3, 0.4],
        [0.9, -0.3],
        [-0.2, -0.5],
        [0.65, 0.3],
      ]) {
        const point = await project(page, -2.35 + dx, 0.59, -0.5 + dz)
        await page.mouse.move(point.x, point.y)
      }
    }
    await expect.poll(async () => (await pose(page)).x).toBeCloseTo(-2.15, 1)
    await expect.poll(async () => (await pose(page)).z).toBeCloseTo(-0.1, 1)
    if (key) {
      await page.waitForTimeout(180)
      await page.keyboard.up(key)
      expect((await pose(page)).angle).not.toBe(0)
    }
    const stopped = await pose(page)
    await page.waitForTimeout(180)
    expect(await pose(page)).toEqual(stopped)
    await pointer(page, -4.8, -3.3)
    await expect(page.locator('footer .invalid')).toHaveCount(1)
    await pointer(page, -1.65, -0.3)
    await expect(page.locator('footer .invalid')).toHaveCount(0)
    await expect.poll(async () => (await pose(page)).x).toBeCloseTo(-2.1, 1)
    await page.mouse.up()
    const final = await pose(page)
    expect(final.angle).toBe(stopped.angle)
    await page.keyboard.press('Control+z')
    expect(await pose(page)).toEqual({ x: -2.8, z: -0.4, angle: 0 })
    await page.keyboard.press('Control+y')
    expect(await pose(page)).toEqual(final)
    expect(errors).toEqual([])
  })

for (const finish of ['pointerup', 'Enter', 'Escape'])
  test(`a 256-event burst followed immediately by ${finish} flushes or discards the final queued pointer without replay`, async ({
    page,
  }) => {
    await open(page)
    await pointer(page, -2.35, -0.5)
    await page.mouse.down()
    const points = await Promise.all(
      [
        [-2.3, -0.6],
        [-2.7, 0.1],
        [-1.75, -0.3],
      ].map(([x, z]) => project(page, x, 0.59, z)),
    )
    await page.evaluate(
      ({ points, finish }) => {
        for (let n = 0; n < 256; n++) {
          const point = points[n === 255 ? 2 : n % 2]
          window.dispatchEvent(
            new PointerEvent('pointermove', {
              clientX: point.x,
              clientY: point.y,
              pointerId: 1,
              buttons: 1,
            }),
          )
        }
        // Another pointer must not replace the active mouse's queued sample.
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 99,
            buttons: 1,
            clientX: 0,
            clientY: 0,
          }),
        )
        if (finish === 'pointerup')
          window.dispatchEvent(
            new PointerEvent('pointerup', { pointerId: 1, buttons: 0 }),
          )
        else
          window.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: finish,
              code: finish,
              bubbles: true,
            }),
          )
      },
      { points, finish },
    )
    await page.mouse.up()
    await page.waitForTimeout(150)
    if (finish === 'Escape')
      await page
        .getByRole('button', { name: 'Журнальный стол', exact: true })
        .click()
    const final = await pose(page)
    if (finish === 'Escape')
      expect(final).toEqual({ x: -2.8, z: -0.4, angle: 0 })
    else {
      expect(final.x).toBeCloseTo(-2.2, 1)
      expect(final.z).toBeCloseTo(-0.2, 1)
      await page.keyboard.press('Control+z')
      expect(await pose(page)).toEqual({ x: -2.8, z: -0.4, angle: 0 })
      await page.keyboard.press('Control+y')
      expect(await pose(page)).toEqual(final)
    }
  })

test('an explicit drawer button supersedes an older queued floor sample before Enter', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'Дубовый комод', exact: true }).click()
  await page.keyboard.press('Tab')
  await page
    .getByRole('button', { name: 'Открыть ящик 3', exact: true })
    .click()
  await page.waitForTimeout(750)
  await page
    .getByRole('button', { name: 'Декоративная коробка', exact: true })
    .click()
  await page.getByRole('button', { name: 'Взять предмет', exact: true }).click()
  const point = await project(page, -1.8, 0.015, 0.8)
  await page.evaluate((point) => {
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        buttons: 0,
      }),
    )
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'В ящик 3: Дубовый комод',
    )!
    button.click()
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
      }),
    )
  }, point)
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 3: Дубовый комод',
  )
  await page.waitForTimeout(150)
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 3: Дубовый комод',
  )
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText('На: Дубовый комод')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 3: Дубовый комод',
  )
})
