import { quarterTurn, buttonQuarterTurn } from './support/rotation'
import { test, expect, type Page } from './support/legacy-test'
import { OrthographicCamera, Vector3 } from 'three'

async function place(page: Page, name: string, x: number, z: number) {
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  const b = (await page.locator('canvas').boundingBox())!
  const state = JSON.parse(
    (await page.locator('canvas').getAttribute('data-camera'))!,
  )
  const camera = new OrthographicCamera(
    -b.width / 2,
    b.width / 2,
    b.height / 2,
    -b.height / 2,
    0.1,
    250,
  )
  camera.position.fromArray(state.position)
  camera.lookAt(new Vector3().fromArray(state.target))
  camera.zoom = state.zoom
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const p = new Vector3(x, 0, z).project(camera)
  await page.mouse.click(
    b.x + ((p.x + 1) * b.width) / 2,
    b.y + ((1 - p.y) * b.height) / 2,
  )
}

test('chair keeps its pose on rug and bare floor, rug moves independently, low camera views remain usable', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
  await place(page, 'Мягкое кресло', -2.5, 1)
  await expect(page.getByTestId('pose')).toHaveText('X -2.50 · Z 1.00 · 90°')
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  await quarterTurn(page, 1)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('pose')).toHaveText('X -2.50 · Z 1.00 · 180°')
  await page.screenshot({ path: 'artifacts/grounding-chair-rug.png' })
  await place(page, 'Ковёр гостиной', -2.7, -1.5)
  await page.getByRole('button', { name: 'Мягкое кресло', exact: true }).click()
  await expect(page.getByTestId('pose')).toHaveText('X -2.50 · Z 1.00 · 180°')
  for (let view = 0; view < 3; view++) {
    await page.mouse.move(850, 600)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(1000, view === 0 ? 350 : 600, { steps: 16 })
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(600)
    await page
      .locator('canvas')
      .screenshot({ path: `artifacts/grounding-low-${view}.png` })
  }
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pose')).toHaveText('X -2.50 · Z 1.00 · 180°')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('pose')).toHaveText('X -2.50 · Z 1.00 · 180°')
})
