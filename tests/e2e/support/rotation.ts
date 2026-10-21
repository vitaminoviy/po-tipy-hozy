import { expect, type Page } from '@playwright/test'

// Legacy placement scenarios require exact quarter-turn fixtures. Twelve 7.5° taps
// in one event-loop turn give that target without timing-dependent held-key angles.
// Free-rotation scenarios separately exercise real Playwright key down/up and time.
export async function quarterTurn(page: Page, direction: 1 | -1) {
  await page.evaluate((direction) => {
    const key = direction > 0 ? 'q' : 'r'
    for (let i = 0; i < 12; i++) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          code: key === 'q' ? 'KeyQ' : 'KeyR',
          bubbles: true,
        }),
      )
      window.dispatchEvent(
        new KeyboardEvent('keyup', {
          key,
          code: key === 'q' ? 'KeyQ' : 'KeyR',
          bubbles: true,
        }),
      )
    }
  }, direction)
  await page.waitForTimeout(220)
}
export async function buttonQuarterTurn(page: Page) {
  await page.getByRole('button', { name: /Повернуть/ }).evaluate((button) => {
    // 36 clockwise taps = -270° = the legacy +90° fixture.
    for (let i = 0; i < 36; i++) (button as HTMLButtonElement).click()
  })
  // Button turns form one animated burst / history action, as in the old fixture.
  await expect(page.getByRole('button', { name: /Повернуть/ })).toBeVisible()
  await page.waitForTimeout(220)
}
