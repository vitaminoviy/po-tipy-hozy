// Re-encode generated source PNGs; no drawing edits or background removal.
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const name of ['workshop-cleanplate', 'workshop-ivy-alpha']) {
    const source = await readFile(`assets/menu/${name}.png`)
    const data = await page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext('2d').drawImage(image, 0, 0)
      return canvas.toDataURL('image/webp', 0.9).split(',')[1]
    }, source.toString('base64'))
    await writeFile(`public/images/${name}.webp`, Buffer.from(data, 'base64'))
  }
} finally {
  await browser.close()
}
