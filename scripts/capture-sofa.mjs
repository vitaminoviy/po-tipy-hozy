// Isolated visual review: real camera controls, no player data or world edits.
import { chromium, expect } from '@playwright/test'
import { Vector3 } from 'three'
import { mkdir } from 'node:fs/promises'
import { preview } from 'vite'

const baseline = process.argv.includes('--baseline')
const viewIndex = process.argv.indexOf('--view')
const onlyView = viewIndex < 0 ? null : process.argv[viewIndex + 1]
const output = `artifacts/visual114/${baseline ? 'old' : 'new'}`
const server = baseline
  ? await preview({
      build: { outDir: 'artifacts/visual114/baseline-dist' },
      preview: { host: '127.0.0.1', port: 4192, strictPort: true },
    })
  : null
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [],
})
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  await page.goto(
    baseline ? 'http://127.0.0.1:4192/' : 'http://localhost:5173/',
  )
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true')
  if (!baseline)
    await expect(canvas).toHaveAttribute('data-furniture-assets', 'ready')
  for (const [name, x, z, zoom, hide, top] of [
    ['isometric', 0, 0, 0, false, false],
    ['living', -2.7, -0.9, 11, true, false],
    ['sofa-front', -2.8, -3.5, 23, true, false],
    ['sofa-angle', -2.8, -3.5, 23, true, false],
    ['family', -2.9, -0.8, 9, true, false],
    ['top', -2.7, -0.8, 10, true, true],
  ]) {
    if (onlyView && onlyView !== name) continue
    await page.keyboard.press('Home')
    await page.waitForTimeout(600)
    if (hide) {
      await page.locator('.house-menu summary').click()
      // Only the side close-up removes walls; other views retain the room.
      // The accessible button name includes its icon, so use partial matching.
      const wallButton = page.getByRole('button', {
        name: name === 'sofa-angle' ? 'Скрыть стены' : 'Показать стены',
      })
      if (await wallButton.count()) await wallButton.click()
      await page.locator('.house-menu summary').click()
    }
    // Frontal three-quarter angle keeps the partition out of the hero views.
    if (hide) {
      const state = JSON.parse(await canvas.getAttribute('data-camera'))
      const offset = new Vector3()
        .fromArray(state.position)
        .sub(new Vector3().fromArray(state.target))
      const theta = Math.atan2(offset.x, offset.z)
      const desired =
        name === 'sofa-front' ? 0 : name === 'sofa-angle' ? 0.48 : -0.14
      const dx = ((theta - desired) * 1000) / (2 * Math.PI)
      await page.mouse.move(720, 500)
      await page.mouse.down({ button: 'middle' })
      await page.mouse.move(720 + dx, top ? 710 : 500, { steps: 15 })
      await page.mouse.up({ button: 'middle' })
      await page.waitForTimeout(700)
    }
    const c = JSON.parse(await canvas.getAttribute('data-camera'))
    const forward = new Vector3()
      .fromArray(c.target)
      .sub(new Vector3().fromArray(c.position))
      .setY(0)
      .normalize()
    const right = new Vector3(-forward.z, 0, forward.x)
    const delta = new Vector3(x - c.target[0], 0, z - c.target[2])
    await page.mouse.move(720, 500)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(
      720 - delta.dot(right) * c.zoom,
      500 + delta.dot(forward) * c.zoom,
      { steps: 12 },
    )
    await page.mouse.up({ button: 'right' })
    await page.waitForTimeout(700)
    for (let i = 0; i < zoom; i++) {
      await page.mouse.wheel(0, -400)
      await page.waitForTimeout(80)
    }
    await page.mouse.move(1, 999)
    await page.waitForTimeout(1000)
    await page.screenshot({
      path: `${output}/${name}.png`,
      clip: name.startsWith('sofa-')
        ? { x: 420, y: 240, width: 620, height: 400 }
        : undefined,
    })
  }
} finally {
  await browser.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
}
