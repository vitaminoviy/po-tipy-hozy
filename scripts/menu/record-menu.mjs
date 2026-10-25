import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11'],
})
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: 'artifacts/menu/video',
      size: { width: 1280, height: 720 },
    },
  })
  const page = await context.newPage()
  await page.goto('http://localhost:5173/')
  await page.getByRole('button', { name: 'New Game', exact: true }).waitFor()
  await page.waitForTimeout(1400)
  await page.screenshot({ path: 'artifacts/menu/workshop-start.png' })
  const metricsPromise = page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = []
        let last = performance.now()
        function frame(t) {
          times.push(t - last)
          last = t
          if (times.length < 840) requestAnimationFrame(frame)
          else {
            const sorted = times.slice(20).sort((a, b) => a - b)
            resolve({
              frames: sorted.length,
              mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
              p95: sorted[Math.floor(sorted.length * 0.95)],
              canvas: document.querySelectorAll('canvas').length,
            })
          }
        }
        requestAnimationFrame(frame)
      }),
  )
  await page.waitForTimeout(3500)
  await page.screenshot({ path: 'artifacts/menu/workshop-middle.png' })
  const metrics = await metricsPromise
  await fs.writeFile(
    'artifacts/menu/motion-metrics.json',
    JSON.stringify(metrics, null, 2),
  )
  await page.screenshot({ path: 'artifacts/menu/workshop-desktop.png' })
  await page.getByRole('button', { name: 'Credits', exact: true }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'artifacts/menu/workshop-credits.png' })
  const video = page.video()
  await context.close()
  await video.saveAs('artifacts/menu/workshop-menu.webm')
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  })
  await mobile.goto('http://localhost:5173/')
  await mobile.waitForTimeout(1600)
  await mobile.screenshot({ path: 'artifacts/menu/workshop-mobile.png' })
  console.log(metrics)
} finally {
  await browser.close()
}
