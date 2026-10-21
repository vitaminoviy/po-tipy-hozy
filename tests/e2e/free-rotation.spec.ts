import { test, expect, type Page } from '@playwright/test'
const pose = (p: Page) => p.getByTestId('pose')
async function angle(p: Page) {
  const value = Number(
    (await pose(p).innerText()).split('·').at(-1)!.replace('°', '').trim(),
  )
  return value > 180 ? value - 360 : value
}
async function open(p: Page, name = 'Журнальный стол') {
  await p.goto('/')
  await expect(p.locator('canvas')).toHaveAttribute('data-scene-ready', 'true')
  await p.getByRole('button', { name: 'Скрыть стены' }).click()
  await p.getByRole('button', { name, exact: true }).click()
  await p
    .getByRole('button', {
      name: name === 'Чашка' ? 'Взять предмет' : 'Переместить',
      exact: true,
    })
    .click()
}
test('real Q/R taps animate 7.5 degrees, reverse cleanly and do not add history until confirmed', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await page.screenshot({ path: 'artifacts/rotation-before.png' })
  await page.keyboard.down('r')
  await page.waitForTimeout(55)
  const middle = await angle(page)
  expect(middle).toBeLessThan(0)
  expect(middle).toBeGreaterThan(-7.5)
  await page.keyboard.up('r')
  await expect.poll(() => angle(page)).toBe(-7.5)
  await page.screenshot({ path: 'artifacts/rotation-tap.png' })
  await expect(
    page.getByRole('button', { name: 'Отменить действие', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('q')
  await expect.poll(() => angle(page)).toBe(0)
  await page.keyboard.press('q')
  await expect.poll(() => angle(page)).toBe(7.5)
  await page.keyboard.press('r')
  await expect.poll(() => angle(page)).toBe(0)
  expect(errors).toEqual([])
})
test('held real keys rotate continuously, stop on release and produce arbitrary undoable angles', async ({
  page,
}) => {
  await open(page)
  await page.keyboard.down('r')
  await page.waitForTimeout(620)
  await page.keyboard.up('r')
  const turned = await angle(page)
  expect(turned).toBeLessThan(-30)
  expect(turned).toBeGreaterThan(-55)
  await page.waitForTimeout(250)
  expect(await angle(page)).toBe(turned)
  await page.screenshot({ path: 'artifacts/rotation-arbitrary.png' })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+z')
  await expect.poll(() => angle(page)).toBe(0)
  await page.keyboard.press('Control+y')
  await expect.poll(() => angle(page)).toBe(turned)
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  await page.keyboard.down('q')
  await page.waitForTimeout(470)
  await page.keyboard.up('q')
  const reversed = await angle(page)
  expect(reversed).toBeGreaterThan(turned)
  await page.waitForTimeout(200)
  expect(await angle(page)).toBe(reversed)
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  expect(await angle(page)).toBe(turned)
})
test('opposing keys, focus, blur, mode switch and text input never leave stuck rotation', async ({
  page,
}) => {
  await open(page)
  await page.keyboard.down('r')
  await page.waitForTimeout(220)
  await page.keyboard.down('q')
  const both = await angle(page)
  await page.waitForTimeout(180)
  expect(await angle(page)).toBe(both)
  await page.keyboard.up('r')
  await page.waitForTimeout(230)
  await page.keyboard.up('q')
  expect(await angle(page)).not.toBe(both)
  await page.evaluate(() => {
    const input = document.createElement('textarea')
    document.body.append(input)
    input.focus()
  })
  const before = await angle(page)
  await page.keyboard.type('qrqr')
  await page.waitForTimeout(180)
  expect(await angle(page)).toBe(before)
  await page.evaluate(() => document.querySelector('textarea')!.remove())
  await page.keyboard.down('r')
  await page.waitForTimeout(180)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('r')
  await page.waitForTimeout(180)
  await page
    .getByRole('button', { name: 'Журнальный стол', exact: true })
    .click()
  expect(await angle(page)).toBe(0)
  await page.getByRole('button', { name: 'Переместить', exact: true }).click()
  await page.keyboard.down('r')
  await page.waitForTimeout(180)
  await page.keyboard.press('Tab')
  await page.keyboard.up('r')
  await page.waitForTimeout(180)
  expect(await angle(page)).toBe(0)
})
for (const name of ['Ковёр гостиной', 'Ведро гостиной'])
  test(`real held rotation of ${name} keeps preview and history`, async ({
    page,
  }) => {
    await open(page, name)
    await page.keyboard.press('r')
    await expect.poll(() => angle(page)).toBe(-7.5)
    if (name === 'Ведро гостиной') {
      await expect(page.locator('footer .invalid')).toHaveCount(0)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Control+z')
      await expect.poll(() => angle(page)).toBe(0)
      await page.keyboard.press('Control+y')
      await expect.poll(() => angle(page)).toBe(-7.5)
    } else {
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name, exact: true }).click()
      expect(await angle(page)).toBe(0)
    }
  })
