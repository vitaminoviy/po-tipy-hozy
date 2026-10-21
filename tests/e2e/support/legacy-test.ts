// Regression suites explicitly open the retained secondary commands.
// The diorama suite uses the standard fixture and tests the closed default UI.
import { test as base } from '@playwright/test'
export { expect, type Page } from '@playwright/test'
export const test = base.extend<{ secondaryCommands: void }>({
  secondaryCommands: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const watch = new MutationObserver(() => {
          const menu = document.querySelector<HTMLDetailsElement>('.house-menu')
          if (menu) {
            menu.open = true
            Array.from(menu.querySelectorAll('button'))
              .find((b) => b.textContent?.trim() === 'Перемещение')
              ?.click()
            watch.disconnect()
          }
        })
        watch.observe(document, { childList: true, subtree: true })
      })
      // A disclosed menu can cover a world target after the responsive refit.
      // Close it for scene input, restore secondary commands after pointer release.
      let restore = false
      const move = page.mouse.move.bind(page.mouse),
        click = page.mouse.click.bind(page.mouse),
        up = page.mouse.up.bind(page.mouse)
      const reveal = async () => {
        if (restore) {
          await page
            .locator('.house-menu')
            .evaluate((m: HTMLDetailsElement) => {
              m.open = true
            })
          restore = false
        }
      }
      const uncover = async (x: number, y: number) => {
        if (x < (page.viewportSize()?.width ?? 1440) - 340 || y > 480) return
        if (restore) return
        const menu = page.locator('.house-menu[open]')
        if (!(await menu.isVisible())) return
        const box = await menu.boundingBox()
        if (
          box &&
          x >= box.x &&
          x <= box.x + box.width &&
          y >= box.y &&
          y <= box.y + box.height
        ) {
          await menu.evaluate((m: HTMLDetailsElement) => {
            m.open = false
          })
          restore = true
        }
      }
      page.mouse.move = async (x, y, options) => {
        await uncover(x, y)
        await move(x, y, options)
      }
      page.mouse.click = async (x, y, options) => {
        await uncover(x, y)
        await click(x, y, options)
        await reveal()
      }
      page.mouse.up = async (options) => {
        await up(options)
        await reveal()
      }
      await use()
    },
    { auto: true },
  ],
})
