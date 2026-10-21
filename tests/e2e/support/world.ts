import type { Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'
export async function world(page: Page, x: number, y: number, z: number) {
  const b = (await page.locator('canvas').boundingBox())!
  const s = JSON.parse(
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
  c.position.fromArray(s.position)
  c.lookAt(new Vector3().fromArray(s.target))
  c.zoom = s.zoom
  c.updateProjectionMatrix()
  c.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(c)
  return {
    x: b.x + ((p.x + 1) * b.width) / 2,
    y: b.y + ((1 - p.y) * b.height) / 2,
  }
}
export async function clickWorld(page: Page, x: number, y: number, z: number) {
  const p = await world(page, x, y, z)
  await page.mouse.click(p.x, p.y)
}
