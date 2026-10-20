import { expect, type Page } from '@playwright/test'

// OrbitControls damping advances with rendered frames. A fixed sleep cannot
// reliably separate a finished orbit from the next pan on different renderers.
export async function waitForCameraStill(page: Page) {
  let previous: number[] | undefined
  let stable = 0
  await expect
    .poll(
      async () => {
        const state = JSON.parse(
          (await page.locator('canvas').getAttribute('data-camera'))!,
        ) as { position: number[]; target: number[]; zoom: number }
        const current = [...state.position, ...state.target, state.zoom]
        stable =
          previous &&
          current.every(
            (value, index) => Math.abs(value - previous![index]) < 0.0002,
          )
            ? stable + 1
            : 0
        previous = current
        return stable >= 3
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBe(true)
}
