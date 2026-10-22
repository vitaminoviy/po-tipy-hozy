import { expect } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'
import { writeFile } from 'node:fs/promises'
export async function soakGame(browser, url, label) {
  const started = performance.now()
  const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    page = await context.newPage(),
    errors = [],
    samples = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.enable')
  const ready = () =>
    expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true')
  const menu = async (open) => {
    if (
      ((await page.locator('.house-menu').getAttribute('open')) !== null) !==
      open
    )
      await page.getByLabel('Меню дома').click()
  }
  const command = async (name) => {
    await menu(true)
    await page.getByRole('button', { name, exact: true }).click()
  }
  const point = async (x, y, z) => {
    const b = await page.locator('canvas').boundingBox(),
      s = JSON.parse(await page.locator('canvas').getAttribute('data-camera')),
      c = new OrthographicCamera(
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
  const click = async (x, y, z) => {
    const p = await point(x, y, z)
    await page.mouse.click(p.x, p.y)
  }
  const stroke = async (a, b) => {
    const p = await point(...a),
      q = await point(...b)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(q.x, q.y, { steps: 8 })
    await page.mouse.up()
  }
  const tool = async (p) => {
    await menu(false)
    await click(...p)
  }
  const waitSave = () =>
    expect(page.getByTestId('save-status')).toHaveAttribute(
      'data-status',
      'saved',
    )
  const digest = () =>
    page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open('quiet-home-progress')
        r.onsuccess = () => resolve(r.result)
      })
      return new Promise((resolve) => {
        const tx = db.transaction('progress'),
          r = tx.objectStore('progress').get('world')
        tx.oncomplete = () => {
          db.close()
          const record = r.result
          const hash = (a) => {
            let h = 2166136261
            for (const v of a) h = Math.imul(h ^ v, 16777619)
            return h >>> 0
          }
          if (record?.world) {
            record.world.dirt = record.world.dirt.map((d) => ({
              id: d.id,
              hash: hash(d.mask),
            }))
            record.world.paint = record.world.paint.map((p) => ({
              id: p.id,
              color: p.color,
              hash: hash(p.mask),
            }))
            record.world.floors = record.world.floors.map((f) => ({
              ...f,
              laid: Array.from(f.laid),
            }))
          }
          resolve(JSON.stringify(record))
        }
      })
    })
  const reset = async () => {
    page.once('dialog', (d) => d.accept())
    await command('Начать заново')
    await ready()
    await waitSave()
    await menu(false)
    await page.waitForTimeout(1200)
  }
  const cadence = async () =>
    page.evaluate(async () => {
      let previous = 0
      const frames = []
      for (let i = 0; i < 120; i++)
        await new Promise((resolve) =>
          requestAnimationFrame((now) => {
            if (previous) frames.push(now - previous)
            previous = now
            resolve()
          }),
        )
      frames.sort((a, b) => a - b)
      return {
        mean: frames.reduce((a, b) => a + b, 0) / frames.length,
        p95: frames[Math.floor(frames.length * 0.95)],
        max: frames.at(-1),
      }
    })
  const cadences = []
  const snapshot = async (phase) => {
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(100)
    const metrics = await cdp.send('Performance.getMetrics'),
      dom = await cdp.send('Memory.getDOMCounters')
    const renderer = await page.evaluate(() => globalThis.__audit.inspect())
    const frames = await page.evaluate(async () => {
      const intervals = []
      let last = 0
      for (let i = 0; i < 60; i++)
        await new Promise((r) =>
          requestAnimationFrame((t) => {
            if (last) intervals.push(t - last)
            last = t
            r()
          }),
        )
      intervals.sort((a, b) => a - b)
      return {
        mean: intervals.reduce((a, b) => a + b, 0) / intervals.length,
        p95: intervals[Math.floor(intervals.length * 0.95)],
        max: intervals.at(-1),
      }
    })
    const sample = {
      phase,
      heapBytes: metrics.metrics.find((m) => m.name === 'JSHeapUsedSize').value,
      dom,
      renderer,
      frames,
    }
    samples.push(sample)
    console.log(JSON.stringify(sample))
  }
  try {
    if (process.argv.includes('--sdk-off'))
      await page.route('https://telegram.org/js/telegram-web-app.js', (r) =>
        r.fulfill({ body: '', contentType: 'application/javascript' }),
      )
    await page.goto(url)
    await ready()
    await reset()
    await snapshot('warm')
    if (process.argv.includes('--reset-only')) {
      for (let i = 0; i < 8; i++) {
        await reset()
        await snapshot('reset-' + i)
      }
      await writeFile(
        `artifacts/09/${label}-resets.json`,
        JSON.stringify(samples, null, 2),
      )
      if (process.argv.includes('--heap')) {
        const chunks = []
        cdp.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) =>
          chunks.push(chunk),
        )
        await cdp.send('HeapProfiler.takeHeapSnapshot')
        await writeFile(`artifacts/09/${label}.heapsnapshot`, chunks.join(''))
      }
      return
    }
    for (let batch = 0; batch < 3; batch++) {
      for (let cycle = 0; cycle < 6; cycle++) {
        await command('Журнальный стол')
        await command('Переместить')
        await menu(false)
        const p = await point(cycle % 2 ? -2.8 : -2.6, 0, -0.4)
        await page.mouse.move(p.x, p.y)
        await page.keyboard.press(cycle % 2 ? 'r' : 'q')
        await page.waitForTimeout(160)
        await page.keyboard.press('Enter')
        await command('Прикроватная тумба')
        await page.keyboard.press('e')
        await command('Книга')
        await command('Взять предмет')
        await command('В ящик 1: Прикроватная тумба')
        await page.keyboard.press('Enter')
        await command('Прикроватная тумба')
        await page.keyboard.press('e')
        await page.keyboard.press('Escape')
        await menu(false)
        if (cycle === 0) {
          await page.keyboard.down('Shift')
          await click(-2.1, 0.04, 2.65)
          await page.keyboard.up('Shift')
          await expect(page.getByTestId('task-trash-living')).toContainText(
            '1 / 5',
          )
        }
        await tool([-2.4, -0.14, 4.55])
        await stroke(
          [-3.55, 0.019, 2.4 + cycle * 0.04],
          [-2.85, 0.019, 2.4 + cycle * 0.04],
        )
        await tool([-3.6, -0.14, 4.55])
        await tool(
          [
            [-1.15, -0.035, 4.7],
            [-0.25, -0.035, 4.7],
            [0.65, -0.035, 4.7],
          ][batch],
        )
        await stroke(
          [-4.902, 2.25 + cycle * 0.1, 1],
          [-4.902, 2.25 + cycle * 0.1, -1],
        )
        await tool([4.25, -0.14, 4.35])
        await stroke(
          [-1.8, 0.017, 1.9 - cycle * 0.1],
          [-0.5, 0.017, 1.9 - cycle * 0.1],
        )
        await page.keyboard.press('Escape')
        await page.keyboard.press('Control+z')
        await page.keyboard.press('Control+y')
        await waitSave()
        await expect(page.getByRole('alert')).toHaveCount(0)
        cadences.push({ batch, cycle, ...(await cadence()) })
        await page.getByRole('button', { name: 'Открыть записку' }).click()
        await page.getByRole('button', { name: 'Закрыть записку' }).click()
        await page.waitForTimeout(300)
        await page.screenshot({
          path: `artifacts/09/soak-${batch}-${cycle}.png`,
        })
      }
      await snapshot('work-' + batch)
      if (batch === 0) {
        const before = await digest()
        await page.reload()
        await ready()
        expect(await digest()).toBe(before)
        await expect(page.getByRole('alert')).toHaveCount(0)
      }
      await reset()
      await snapshot('reset-' + batch)
    }
    expect(errors).toEqual([])
    await writeFile(
      `artifacts/09/${label}-soak.json`,
      JSON.stringify(
        {
          cycles: 18,
          resets: 4,
          durationMs: performance.now() - started,
          samples,
          cadences,
          errors,
        },
        null,
        2,
      ),
    )
    for (const s of samples.filter((s) => s.phase.startsWith('reset-'))) {
      expect(s.renderer.gpuGeometries).toBe(samples[0].renderer.gpuGeometries)
      expect(s.renderer.gpuTextures).toBe(samples[0].renderer.gpuTextures)
      expect(s.renderer.liveContexts).toBe(1)
      expect(s.dom.jsEventListeners).toBeLessThan(
        samples[0].dom.jsEventListeners + 15,
      )
    }
    await writeFile(
      `artifacts/09/${label}-soak.json`,
      JSON.stringify(
        {
          cycles: 18,
          resets: 4,
          durationMs: performance.now() - started,
          samples,
          cadences,
          errors,
        },
        null,
        2,
      ),
    )
  } finally {
    await context.close()
  }
}
