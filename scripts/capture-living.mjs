// Isolated visual review: real camera controls, no player data or world edits.
import { chromium, expect } from '@playwright/test'
import { Vector3 } from 'three'
import { mkdir } from 'node:fs/promises'

const output = 'artifacts/visual11'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [],
})
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  await page.goto('http://localhost:5173/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true')
  for (const [name, x, z, zoom, hide, top] of [
    ['isometric', 0, 0, 0, false, false],
    ['living', -2.7, -0.9, 11, true, false],
    ['sofa', -2.8, -3.5, 23, true, false],
    ['chair-table', -3.2, 0.3, 17, true, false],
    ['top', -2.7, -0.8, 10, true, true],
  ]) {
    if (process.argv[2] && name !== process.argv[2]) continue
    await page.keyboard.press('Home')
    await page.waitForTimeout(600)
    if (hide) {
      await page.locator('.house-menu summary').click()
      const hideButton = page.getByRole('button', {
        name: 'Скрыть стены',
        exact: true,
      })
      if (await hideButton.count()) await hideButton.click()
      await page.locator('.house-menu summary').click()
    }
    // Frontal three-quarter angle keeps the partition out of the hero views.
    if (hide) {
      await page.mouse.move(720, 500)
      await page.mouse.down({ button: 'middle' })
      await page.mouse.move(850, top ? 710 : 500, { steps: 15 })
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
      clip:
        name === 'sofa'
          ? { x: 420, y: 240, width: 620, height: 400 }
          : name === 'chair-table'
            ? { x: 320, y: 150, width: 800, height: 650 }
            : undefined,
    })
  }
} finally {
  await browser.close()
}
