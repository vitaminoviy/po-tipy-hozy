import { test, expect, type Page } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

const select = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()
const pose = (page: Page) => page.getByTestId('pose')
async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Скрыть стены' }).click()
}
async function camera(page: Page) {
  return JSON.parse(
    (await page.locator('canvas').getAttribute('data-camera'))!,
  ) as { position: number[]; target: number[]; zoom: number }
}
async function hold(page: Page, key: string, ms = 320) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}
async function point(page: Page, x: number, y: number, z: number) {
  const b = (await page.locator('canvas').boundingBox())!,
    state = await camera(page)
  const c = new OrthographicCamera(
    -b.width / 2,
    b.width / 2,
    b.height / 2,
    -b.height / 2,
    0.1,
    250,
  )
  c.position.fromArray(state.position)
  c.lookAt(new Vector3().fromArray(state.target))
  c.zoom = state.zoom
  c.updateProjectionMatrix()
  c.updateMatrixWorld()
  const p = new Vector3(x, y, z).project(c)
  return {
    x: b.x + ((p.x + 1) * b.width) / 2,
    y: b.y + ((1 - p.y) * b.height) / 2,
  }
}
async function clickWorld(page: Page, x: number, y: number, z: number) {
  const p = await point(page, x, y, z)
  await page.mouse.click(p.x, p.y)
}
const distance = (a: number[], b: number[]) =>
  new Vector3().fromArray(a).distanceTo(new Vector3().fromArray(b))

test('camera WASD, shift, yaw, middle orbit, right pan, bounds and text editing do not manipulate furniture', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Дубовый комод')
  const originalPose = await pose(page).textContent(),
    initial = await camera(page)
  await hold(page, 'w')
  await page.waitForTimeout(300)
  const walked = await camera(page),
    walkDistance = distance(walked.target, initial.target)
  // 320 ms at 5.5 m/s with acceleration and the subsequent braking tail.
  expect(walkDistance).toBeGreaterThan(1.2)
  expect(walkDistance).toBeLessThan(2.2)
  expect(walked.target[1]).toBe(0)
  expect(walked.position[1]).toBeCloseTo(11, 5)
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await hold(page, 'w')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(300)
  expect(distance((await camera(page)).target, initial.target)).toBeGreaterThan(
    walkDistance * 1.6,
  )
  await page.keyboard.press('Home')
  await page.keyboard.press('Escape')
  await hold(page, 'e')
  await hold(page, 'q')
  expect(
    distance((await camera(page)).position, initial.position),
  ).toBeLessThan(0.001)
  await select(page, 'Дубовый комод')
  await page.mouse.move(950, 650)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1080, 650, { steps: 12 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(500)
  const yaw = await camera(page)
  expect(distance(yaw.position, initial.position)).toBeGreaterThan(2)
  await hold(page, 'w')
  const advanced = await camera(page)
  const forward = new Vector3()
    .fromArray(yaw.target)
    .sub(new Vector3().fromArray(yaw.position))
    .setY(0)
    .normalize()
  expect(
    new Vector3()
      .fromArray(advanced.target)
      .sub(new Vector3().fromArray(yaw.target))
      .normalize()
      .dot(forward),
  ).toBeGreaterThan(0.99)
  await page.keyboard.press('Home')
  await page.mouse.move(950, 650)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1100, 700, { steps: 12 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(500)
  const orbited = await camera(page)
  expect(distance(orbited.target, initial.target)).toBeLessThan(0.001)
  expect(distance(orbited.position, initial.position)).toBeGreaterThan(2)
  expect(Math.abs(orbited.position[1] - 11)).toBeGreaterThan(1)
  const polar = Math.acos(
    orbited.position[1] / distance(orbited.position, orbited.target),
  )
  expect(polar).toBeGreaterThanOrEqual(0.35 - 1e-6)
  expect(polar).toBeLessThanOrEqual(1.3 + 1e-6)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1000, 600, { steps: 12 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(500)
  const panned = await camera(page)
  expect(distance(panned.target, orbited.target)).toBeGreaterThan(0.2)
  expect(panned.target[1]).toBe(0)
  expect(
    distance(
      panned.position.map((v, i) => v - panned.target[i]),
      orbited.position.map((v, i) => v - orbited.target[i]),
    ),
  ).toBeLessThan(0.01)
  expect(
    await page
      .locator('canvas')
      .evaluate(
        (el) =>
          !el.dispatchEvent(
            new MouseEvent('contextmenu', { cancelable: true, bubbles: true }),
          ),
      ),
  ).toBe(true)
  await expect(pose(page)).toHaveText(originalPose!)
  await page.keyboard.press('Home')
  for (const [y, limit] of [
    [70, 1.3],
    [900, 0.35],
  ]) {
    await page.mouse.move(950, 650)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(950, y, { steps: 20 })
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(600)
    const tilted = await camera(page)
    expect(
      Math.acos(
        (tilted.position[1] - tilted.target[1]) /
          distance(tilted.position, tilted.target),
      ),
    ).toBeCloseTo(limit, 4)
    await page.screenshot({ path: `artifacts/camera-polar-${limit}.png` })
    await page.waitForTimeout(150)
    expect(
      distance((await camera(page)).position, tilted.position),
    ).toBeLessThan(0.01)
  }
  await expect(pose(page)).toHaveText(originalPose!)
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await hold(page, 'w', 1500)
  await page.keyboard.up('Shift')
  const bounded = await camera(page)
  expect(Math.abs(bounded.target[0])).toBeLessThanOrEqual(4)
  expect(Math.abs(bounded.target[2])).toBeLessThanOrEqual(3)
  await page.keyboard.press('Home')
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'typing-test'
    document.body.append(input)
    input.focus()
  })
  const typingCamera = await camera(page)
  await page.keyboard.type('wasdqer')
  await page.keyboard.press('Home')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Tab')
  expect(
    distance((await camera(page)).position, typingCamera.position),
  ).toBeLessThan(0.001)
  await expect(
    page.getByRole('button', { name: /^Взаимодействие/ }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(pose(page)).toHaveText(originalPose!)
})

test('E interacts in both modes, Q/R are placement-only and typing suppresses actions', async ({
  page,
}) => {
  await open(page)
  const initial = await camera(page)
  await select(page, 'Торшер')
  await page.keyboard.down('e')
  await page.keyboard.down('e')
  await page.keyboard.up('e')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Выключить торшер', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('e')
  await expect(
    page.getByRole('button', { name: 'Включить торшер', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(
    page.getByRole('button', { name: 'Выключить торшер', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+y')
  await select(page, 'Прикроватная тумба')
  await page.keyboard.press('e')
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 1', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('e')
  await expect(
    page.getByRole('button', { name: 'Открыть ящик 1', exact: true }),
  ).toBeVisible()
  await select(page, 'Дубовый комод')
  await select(page, 'Открыть ящик 2')
  await page.keyboard.press('e')
  await expect(
    page.getByRole('button', { name: 'Открыть ящик 2', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('e')
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 1', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Tab')
  await select(page, 'Журнальный стол')
  const tablePose = await pose(page).textContent()
  await page.keyboard.press('q')
  await page.keyboard.press('r')
  await page.keyboard.press('e')
  await expect(pose(page)).toHaveText(tablePose!)
  await select(page, 'Книга')
  await page.keyboard.press('e')
  await expect(page.getByRole('button', { name: /^Установить/ })).toBeVisible()
  const bookPose = await pose(page).textContent()
  await page.keyboard.press('e')
  await expect(pose(page)).toHaveText(bookPose!)
  await page.keyboard.press('r')
  await expect(pose(page)).toContainText('90°')
  await page.keyboard.press('q')
  await expect(pose(page)).toHaveText(bookPose!)
  await page.keyboard.press('Escape')
  await select(page, 'Торшер')
  await page.evaluate(() => {
    const input = document.createElement('textarea')
    document.body.append(input)
    input.focus()
  })
  await page.keyboard.type('e')
  await page.keyboard.press('Tab')
  await page.evaluate(() => document.querySelector('textarea')!.remove())
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Включить торшер', exact: true }),
  ).toBeVisible()
  expect(
    distance((await camera(page)).position, initial.position),
  ).toBeLessThan(0.001)
})

test('keyboard placement owns WASD, precision and Q/R; enter records once, escape cancels, history restores', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Дубовый комод')
  const initial = await pose(page).textContent(),
    cameraBefore = await camera(page)
  await select(page, 'Переместить')
  await hold(page, 'w')
  const normal = await pose(page).textContent()
  expect(normal).not.toBe(initial)
  await page.keyboard.down('Shift')
  await hold(page, 'w')
  await page.keyboard.up('Shift')
  await page.keyboard.press('q')
  await expect(pose(page)).toContainText('270°')
  await page.keyboard.press('r')
  await expect(pose(page)).toContainText('0°')
  const placed = await pose(page).textContent()
  expect(
    distance((await camera(page)).target, cameraBefore.target),
  ).toBeLessThan(0.001)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Переместить', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Control+z')
  await expect(pose(page)).toHaveText(initial!)
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(pose(page)).toHaveText(placed!)
  await select(page, 'Переместить')
  await hold(page, 's')
  await page.keyboard.press('Escape')
  await select(page, 'Дубовый комод')
  await expect(pose(page)).toHaveText(placed!)
  await hold(page, 'd')
  expect(
    distance((await camera(page)).target, cameraBefore.target),
  ).toBeGreaterThan(0.2)
  await page.keyboard.press('Home')
  // Switching modes cancels a pending move and routes keys back to the camera.
  await select(page, 'Переместить')
  await hold(page, 'w')
  await page.keyboard.press('Tab')
  await expect(pose(page)).toHaveText(placed!)
  await expect(
    page.getByRole('button', { name: /^Взаимодействие/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await hold(page, 'a')
  expect(
    distance((await camera(page)).target, cameraBefore.target),
  ).toBeGreaterThan(0.2)
})

test('nightstand drawer stores book, closes with contents, follows host move, supports extraction and history', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await select(page, 'Прикроватная тумба')
  await page.keyboard.press('Tab')
  const closed = await page.locator('canvas').screenshot()
  await clickWorld(page, 1.05, 0.5, -2.27)
  await expect(
    page.getByRole('button', { name: 'Закрыть ящик 1', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Открыть ящик 2', exact: true }),
  ).toHaveCount(0)
  await page.waitForTimeout(100)
  const mid = await page.locator('canvas').screenshot()
  await page.waitForTimeout(700)
  expect(closed.equals(mid)).toBe(false)
  expect(mid.equals(await page.locator('canvas').screenshot())).toBe(false)
  await select(page, 'Книга')
  await select(page, 'Взять предмет')
  await page
    .getByRole('button', { name: 'В ящик 1: Прикроватная тумба', exact: true })
    .click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Прикроватная тумба',
  )
  await expect(pose(page)).toHaveText('X 1.05 · Z -2.27 · 0°')
  await page.screenshot({ path: 'artifacts/storage-nightstand-open.png' })
  await select(page, 'Прикроватная тумба')
  await select(page, 'Закрыть ящик 1')
  await page.waitForTimeout(650)
  await page.screenshot({ path: 'artifacts/storage-nightstand-closed.png' })
  await select(page, 'Книга')
  await select(page, 'Взять предмет')
  await expect(page.locator('footer')).toContainText('Сначала откройте ящик')
  await expect(page.getByRole('button', { name: /^Установить/ })).toHaveCount(0)
  await select(page, 'Прикроватная тумба')
  await select(page, 'Открыть ящик 1')
  await select(page, 'Достать: Книга')
  await clickWorld(page, -3, 0.595, -0.5)
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Прикроватная тумба',
  )
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await page.keyboard.press('Control+z')
  await select(page, 'Прикроватная тумба')
  await page.keyboard.press('Tab')
  await select(page, 'Переместить')
  await clickWorld(page, 1, 0, -2.2)
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Открыть ящик 1', exact: true }),
  ).toBeVisible()
  await select(page, 'Открыть ящик 1')
  await page.waitForTimeout(700)
  await select(page, 'Книга')
  await expect(pose(page)).toHaveText('X 1.00 · Z -1.87 · 0°')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Прикроватная тумба',
  )
  await expect(page.locator('.item-list button')).toHaveCount(13)
  await expect(
    page.getByRole('button', { name: 'Книга', exact: true }),
  ).toHaveCount(1)
  // Height rejection uses the same red preview / commit guard as tabletop edges.
  await select(page, 'Декоративная коробка')
  await select(page, 'Взять предмет')
  await select(page, 'В ящик 1: Прикроватная тумба')
  await expect(page.locator('footer .invalid')).toContainText('слишком высокий')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Установить/ })).toBeVisible()
  await page.screenshot({ path: 'artifacts/storage-too-tall.png' })
  await page.keyboard.press('Escape')
  await select(page, 'Декоративная коробка')
  await expect(page.getByTestId('attachment')).toHaveText('На: Дубовый комод')
  expect(errors).toEqual([])
})

test('mouse drop into an open large drawer, overlap rejection, cup/box storage and repeated retrieval', async ({
  page,
}) => {
  await open(page)
  await select(page, 'Дубовый комод')
  await page.keyboard.press('Tab')
  await select(page, 'Открыть ящик 1')
  await page.waitForTimeout(750)
  await select(page, 'Книга')
  await select(page, 'Взять предмет')
  await clickWorld(page, 4, 0.21, 3.04)
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 1: Дубовый комод',
  )
  const bookPose = await pose(page).textContent()
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await select(page, 'В ящик 1: Дубовый комод')
  await expect(page.locator('footer .invalid')).toContainText('другой предмет')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Установить/ })).toBeVisible()
  // Move away from the occupied centre using camera-relative precision movement.
  await page.keyboard.down('Shift')
  await hold(page, 'd', 2000)
  await page.keyboard.up('Shift')
  await page.keyboard.press('Enter')
  await expect(page.locator('footer .invalid')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Установить/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await select(page, 'Дубовый комод')
  await select(page, 'Открыть ящик 2')
  await select(page, 'Чашка')
  await select(page, 'Взять предмет')
  await select(page, 'В ящик 2: Дубовый комод')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 2: Дубовый комод',
  )
  await select(page, 'Дубовый комод')
  await select(page, 'Открыть ящик 3')
  await select(page, 'Декоративная коробка')
  await select(page, 'Взять предмет')
  await select(page, 'В ящик 3: Дубовый комод')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 3: Дубовый комод',
  )
  await select(page, 'Дубовый комод')
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let n = 1; n <= 3; n++) await select(page, `Закрыть ящик ${n}`)
    for (let n = 1; n <= 3; n++) await select(page, `Открыть ящик ${n}`)
  }
  await page.waitForTimeout(750)
  await page.screenshot({ path: 'artifacts/storage-all-drawers.png' })
  for (const name of ['Книга', 'Чашка', 'Декоративная коробка']) {
    await select(page, name)
    await expect(page.getByTestId('attachment')).toContainText('В ящике')
  }
  await select(page, 'Книга')
  await expect(pose(page)).toHaveText(bookPose!)
  await expect(page.locator('.item-list button')).toHaveCount(13)
  await select(page, 'Дубовый комод')
  await select(page, 'Достать: Чашка')
  await clickWorld(page, -2.46, 0.595, -0.27)
  await expect(page.getByTestId('attachment')).toHaveText('На: Журнальный стол')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('attachment')).toHaveText(
    'В ящике 2: Дубовый комод',
  )
})
