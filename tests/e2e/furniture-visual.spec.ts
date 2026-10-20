import { test, expect, type Page } from '@playwright/test'
import { Vector3 } from 'three'

async function camera(page: Page) {
  return JSON.parse(
    (await page.locator('canvas').getAttribute('data-camera'))!,
  ) as {
    position: number[]
    target: number[]
    zoom: number
  }
}

test('upholstered models: mouse orbit in both axes, two zoom levels and stable views', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true')
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  const bounds = (await canvas.boundingBox())!
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  for (const [kind, x, z] of [
    ['sofa', -2.8, -2.45],
    ['chair', -4, 1.6],
    ['bed', 2.8, -1.65],
  ] as const) {
    const zooms: number[] = []
    for (const [level, wheel] of [
      ['far', 400],
      ['near', -400],
    ] as const) {
      await page.keyboard.press('Home')
      await expect
        .poll(async () =>
          new Vector3()
            .fromArray((await camera(page)).position)
            .distanceTo(new Vector3(12, 11, 15)),
        )
        .toBeLessThan(0.001)
      const state = await camera(page)
      const forward = new Vector3()
        .fromArray(state.target)
        .sub(new Vector3().fromArray(state.position))
        .setY(0)
        .normalize()
      const right = new Vector3(-forward.z, 0, forward.x)
      const delta = new Vector3(x - state.target[0], 0, z - state.target[2])
      // OrbitControls' orthographic ground-plane pan, driven through real RMB.
      await page.mouse.move(center.x, center.y)
      await page.mouse.down({ button: 'right' })
      await page.mouse.move(
        center.x - delta.dot(right) * state.zoom,
        center.y + delta.dot(forward) * state.zoom,
        { steps: 12 },
      )
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(600)
      expect(
        new Vector3()
          .fromArray((await camera(page)).target)
          .distanceTo(new Vector3(x, 0, z)),
      ).toBeLessThan(0.02)
      await page.mouse.move(center.x, center.y)
      for (let n = 0; n < 10; n++) await page.mouse.wheel(0, wheel)
      await page.waitForTimeout(200)
      zooms.push((await camera(page)).zoom)
      for (let view = 0; view < 4; view++) {
        await page.mouse.move(center.x, center.y)
        await page.mouse.down({ button: 'middle' })
        await page.mouse.move(
          center.x + bounds.height / 4,
          center.y + [0, -65, 45, -30][view],
          { steps: 16 },
        )
        await page.mouse.up({ button: 'middle' })
        await page.waitForTimeout(800)
        const first = await camera(page)
        await canvas.screenshot({
          path: `artifacts/furniture-${kind}-${level}-${view}.png`,
        })
        await page.waitForTimeout(100)
        const settled = await camera(page)
        expect(
          new Vector3()
            .fromArray(first.position)
            .distanceTo(new Vector3().fromArray(settled.position)),
        ).toBeLessThan(0.01)
        const polar = Math.acos(
          (settled.position[1] - settled.target[1]) /
            new Vector3()
              .fromArray(settled.position)
              .distanceTo(new Vector3().fromArray(settled.target)),
        )
        expect(polar).toBeGreaterThanOrEqual(0.35 - 1e-6)
        expect(polar).toBeLessThanOrEqual(1.3 + 1e-6)
      }
    }
    expect(zooms[1]).toBeGreaterThan(zooms[0] * 1.5)
  }
  expect(errors).toEqual([])
})
