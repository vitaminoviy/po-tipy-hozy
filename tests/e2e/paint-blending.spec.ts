import { test, expect } from '@playwright/test'
import { world, clickWorld } from './support/world'
import { paintWalls, wallWorld, type PaintColor } from '../../src/painting'
import { toolPositions } from '../../src/workArea'
const baseline = !!process.env.PAINT_BLEND_BASELINE
for (const id of ['wall-living', 'wall-bedroom'])
  for (const color of ['cream', 'sage', 'terracotta'] as PaintColor[]) {
    test('clean blended edges ' + id + ' ' + color, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.goto('/')
      await expect(page.locator('canvas')).toHaveAttribute(
        'data-scene-ready',
        'true',
      )
      const wall = paintWalls.find((w) => w.id === id)!
      const click = async (key: keyof typeof toolPositions) => {
        const p = toolPositions[key]
        await clickWorld(page, p[0], p[1], p[2])
      }
      await click('roller')
      await click(color)
      const move = async (u: number, v: number, steps = 1) => {
        const p = wallWorld(wall, { x: u, y: v })
        const q = await world(page, p.x, p.y, p.z)
        await page.mouse.move(q.x, q.y, { steps })
      }
      await page.mouse.move(30, 700)
      const before = await page.screenshot()
      await move(-0.8, 0.8)
      await page.mouse.down()
      await move(0.8, 0.8, 12)
      await page.mouse.up()
      await page.mouse.move(30, 700)
      const folder = 'artifacts/063-' + (baseline ? 'before' : 'after')
      const name = id + '-' + color
      const first = await page.screenshot({
        path: folder + '/' + name + '-short.png',
      })
      const points: { x: number; y: number }[] = []
      for (const u of [-0.5, -0.25, 0, 0.25, 0.5])
        for (let v = 0.65; v <= 0.95; v += 0.002) {
          const p = wallWorld(wall, { x: u, y: v })
          points.push(await world(page, p.x, p.y, p.z))
        }
      const cores = []
      for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const p = wallWorld(wall, { x: u, y: 0.8 })
        cores.push(await world(page, p.x, p.y, p.z))
      }
      const read = async (buffer: Buffer, coords = points) =>
        page.evaluate(
          async ({ url, coords }) => {
            const img = new Image()
            img.src = url
            await img.decode()
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            const data = ctx.getImageData(0, 0, img.width, img.height).data
            return coords.map((p) =>
              Array.from(
                data.slice(
                  (Math.round(p.y) * img.width + Math.round(p.x)) * 4,
                  (Math.round(p.y) * img.width + Math.round(p.x)) * 4 + 3,
                ),
              ),
            )
          },
          { url: 'data:image/png;base64,' + buffer.toString('base64'), coords },
        )
      const old = await read(before),
        now = await read(first),
        core = await read(first, cores)
      let worst = 0
      const stride = points.length / 5
      for (let i = 0; i < points.length; i++)
        for (let c = 0; c < 3; c++)
          worst = Math.max(
            worst,
            Math.min(old[i][c], core[Math.floor(i / stride)][c]) - now[i][c],
          )
      console.log(name + ' edge undershoot ' + worst)
      if (!baseline) expect(worst).toBeLessThanOrEqual(3)
      const progress = await page
        .getByTestId('active-tool-progress')
        .textContent()
      await move(-0.8, 0.8)
      await page.mouse.down()
      await move(0.8, 0.8)
      await page.mouse.up()
      await page.mouse.move(30, 700)
      expect(await page.getByTestId('active-tool-progress').textContent()).toBe(
        progress,
      )
      const repeat = await page.screenshot()
      expect(await read(repeat)).toEqual(now)
      await move(-0.5, 0.45)
      await page.mouse.down()
      await move(0.5, 1.15, 16)
      await page.mouse.up()
      await move(0.35, 0.8)
      await page.mouse.down()
      for (let i = 1; i <= 36; i++)
        await move(
          Math.cos((i * Math.PI) / 18) * 0.35,
          0.8 + Math.sin((i * Math.PI) / 18) * 0.25,
        )
      await page.mouse.up()
      await page.mouse.move(30, 700)
      await page.screenshot({ path: folder + '/' + name + '-cross-circle.png' })
      const corners = []
      for (const [x, y] of [
        [-1, 0.3],
        [-1, 1.3],
        [1, 0.3],
        [1, 1.3],
      ]) {
        const p = wallWorld(wall, { x, y })
        corners.push(await world(page, p.x, p.y, p.z))
      }
      const left = Math.floor(Math.min(...corners.map((p) => p.x))) - 8,
        top = Math.floor(Math.min(...corners.map((p) => p.y))) - 8
      await page.screenshot({
        path: folder + '/' + name + '-detail.png',
        clip: {
          x: left,
          y: top,
          width: Math.ceil(Math.max(...corners.map((p) => p.x))) - left + 8,
          height: Math.ceil(Math.max(...corners.map((p) => p.y))) - top + 8,
        },
      })
      const q = await world(page, wall.x, 2.3, wall.z)
      await page.mouse.move(q.x, q.y)
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(250)
      await page.mouse.move(30, 700)
      await page.screenshot({ path: folder + '/' + name + '-close.png' })
      expect(errors).toEqual([])
    })
  }
