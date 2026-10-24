import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  // Missing-image test deliberately aborts a network request.
  await page.exposeFunction('splashErrors', () => errors)
})

test('splash loads alongside the world and dismisses automatically', async ({
  page,
}) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 100))
  await page.goto('/')
  const splash = page.getByRole('status', { name: 'Quiet Home' })
  await expect(splash).toBeVisible()
  await expect(splash.locator('img')).toHaveJSProperty('complete', true)
  await expect(page.locator('#root > div[inert]')).toHaveCount(1)
  // Pause only CSS animation at its plateau for a reproducible visual capture.
  await splash.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause()
      animation.currentTime = 1050
    }
  })
  await page.screenshot({ path: 'artifacts/splash/quiet-home.png' })
  await page.clock.resume()
  await expect(splash).toHaveCount(0, { timeout: 4000 })
  await expect(page.locator('#root > div[inert]')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
  await page.getByLabel('Меню дома').click()
  await expect(splash).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).splashErrors())).toEqual([])
})

for (const gesture of ['click', 'key', 'tap'] as const) {
  test(`splash can be skipped by ${gesture} without passing input to the game`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()
    try {
      await page.goto('/')
      const splash = page.getByRole('status', { name: 'Quiet Home' })
      await expect(splash).toBeVisible()
      if (gesture === 'key') await page.keyboard.press('Space')
      else if (gesture === 'tap') await page.touchscreen.tap(195, 422)
      else await page.mouse.click(195, 422)
      await expect(splash).toHaveCount(0)
      await expect(page.locator('canvas')).toHaveAttribute(
        'data-scene-ready',
        'true',
      )
      await expect(page.locator('.house-menu')).not.toHaveAttribute('open', '')
    } finally {
      await context.close()
    }
  })
}

test('missing splash image never blocks entry', async ({ page }) => {
  await page.route('**/images/quiet-home-splash.png', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('.startup-splash')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-scene-ready',
    'true',
  )
})

for (const [width, height] of [
  [1920, 1080],
  [1280, 720],
  [800, 600],
  [390, 844],
]) {
  test(`logo keeps its proportions and center at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    const image = page.locator('.startup-splash img')
    await expect(image).toBeVisible()
    const box = (await image.boundingBox())!
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(1)
    expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThan(1)
    expect(box.width / box.height).toBeCloseTo(1.5, 2)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await expect(page.locator('.startup-splash')).toHaveCount(0)
  })
}

test('slow asset keeps a loading status until ready, even after repeated skips', async ({
  page,
}) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/models/sofa/*.glb', async (route) => {
    await held
    await route.continue()
  })
  try {
    await page.goto('/')
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-furniture-assets',
      'loading',
    )
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    await page.mouse.click(20, 20)
    await expect(
      page
        .locator('.startup-splash')
        .getByText('Загрузка дома…', { exact: true }),
    ).toBeVisible()
    await expect(page.locator('#root > div[inert]')).toHaveCount(1)
    release()
    await expect(page.locator('.startup-splash')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-furniture-assets',
      'ready',
    )
    await page.getByLabel('Меню дома').click()
    await expect(page.locator('.house-menu')).toHaveAttribute('open', '')
  } finally {
    release()
  }
})

test('reduced motion uses a still logo and enters normally', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const image = page.locator('.startup-splash img')
  await expect(image).toBeVisible()
  expect(
    await image.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  await expect(page.locator('.startup-splash')).toHaveCount(0)
})
