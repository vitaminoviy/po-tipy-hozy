// Separate instrumented production build. Never connects to a user profile.
import { build, preview } from 'vite'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { OrthographicCamera, Vector3 } from 'three'
import { soakGame } from './soak-game.mjs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
const label = process.argv[2] ?? 'baseline'
const sofa = process.argv.includes('--sofa')
const refIndex = process.argv.indexOf('--ref'),
  ref = refIndex < 0 ? null : process.argv[refIndex + 1]
if (ref && !/^[0-9a-f]{7,40}$/.test(ref))
  throw new Error('Reference must be a commit hash')
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple report label')
await mkdir('artifacts/09', { recursive: true })
const diagnostic = {
  name: 'audit-only',
  enforce: 'pre',
  load(id) {
    if (!ref) return
    const path = id.split('?')[0].replaceAll('\\', '/'),
      prefix = resolve('src').replaceAll('\\', '/') + '/'
    if (
      path.toLowerCase().startsWith(prefix.toLowerCase()) &&
      /\.(ts|tsx|css)$/.test(path)
    )
      return execFileSync(
        'git',
        ['show', `${ref}:src/${path.slice(prefix.length)}`],
        { encoding: 'utf8', windowsHide: true },
      )
  },
  transform(source, id) {
    const path = id.split('?')[0].replaceAll('\\', '/')
    const init = `globalThis.__audit ??= {checks:0,appRenders:0,sceneRenders:0,latencies:[],last:0,consumed:0};\n`
    if (path.endsWith('/src/placement.ts'))
      return (
        init +
        source.replace(
          'export function validatePlacement(item: Item, items: Item[]): string | null {',
          'export function validatePlacement(item: Item, items: Item[]): string | null { globalThis.__audit.checks++;',
        )
      )
    if (path.endsWith('/src/App.tsx'))
      return (
        init +
        source
          .replace(
            'const items = history.present',
            'globalThis.__audit.appRenders++; const items = history.present',
          )
          .replace(
            'setDraftState(next)',
            `if(next && globalThis.__audit.last !== globalThis.__audit.consumed) { globalThis.__audit.latencies.push(performance.now()-globalThis.__audit.last); globalThis.__audit.consumed=globalThis.__audit.last; } setDraftState(next)`,
          )
      )
    if (path.endsWith('/src/Furniture.tsx'))
      return (
        init +
        source.replace(
          'const kind = item.kind',
          'globalThis.__audit.modelRenders++; const kind = item.kind',
        )
      )
    if (path.endsWith('/src/Scene.tsx'))
      return (
        init +
        source.replace(
          'const { camera, gl, raycaster, size, scene } = useThree()',
          `const { camera, gl, raycaster, size, scene } = useThree()
      globalThis.__audit.sceneRenders++;
      globalThis.__audit.seen ??=new WeakSet(); globalThis.__audit.renderers ??=[];
      if(!globalThis.__audit.seen.has(gl)){globalThis.__audit.seen.add(gl);globalThis.__audit.renderers.push(new WeakRef(gl))}
      globalThis.__audit.inspect=()=>{
        const materials=new Set(),geometries=new Set();let objects=0,meshes=0;
        scene.traverse(o=>{objects++;if(o.isMesh)meshes++;if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat())if(m)materials.add(m)});
        return {objects,meshes,materials:materials.size,sceneGeometries:geometries.size,drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,gpuGeometries:gl.info.memory.geometries,gpuTextures:gl.info.memory.textures,programs:gl.info.programs.length,liveContexts:globalThis.__audit.renderers.map(r=>r.deref()).filter(r=>r&&!r.getContext().isContextLost()).length};
      }`,
        )
      )
  },
}
await build({
  plugins: [diagnostic],
  build: { outDir: 'artifacts/09/profile-dist', sourcemap: true },
})
const server = await preview({
  build: { outDir: 'artifacts/09/profile-dist' },
  preview: { host: '127.0.0.1', port: 4191, strictPort: true },
})
let browser
const results = []
try {
  browser = await chromium.launch({
    headless: true,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [],
  })
  for (
    let trial = 0;
    trial < (process.argv.includes('--soak') ? 0 : 3);
    trial++
  ) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage()
    await page.goto('http://127.0.0.1:4191/')
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-scene-ready',
      'true',
    )
    await page.getByLabel('Меню дома').click()
    await page.getByRole('button', { name: 'Перемещение', exact: true }).click()
    await page.getByRole('button', { name: 'Скрыть стены' }).click()
    await page
      .getByRole('button', {
        name: sofa ? 'Диван «Мох»' : 'Журнальный стол',
        exact: true,
      })
      .click()
    await page.getByRole('button', { name: 'Переместить', exact: true }).click()
    await page.locator('.house-menu').evaluate((m) => {
      m.open = false
    })
    const box = await page.locator('canvas').boundingBox(),
      state = JSON.parse(
        await page.locator('canvas').getAttribute('data-camera'),
      )
    const camera = new OrthographicCamera(
      -box.width / 2,
      box.width / 2,
      box.height / 2,
      -box.height / 2,
      0.1,
      250,
    )
    camera.position.fromArray(state.position)
    camera.lookAt(new Vector3().fromArray(state.target))
    camera.zoom = state.zoom
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const points = Array.from({ length: 24 }, (_, i) => {
      const p = new Vector3(
        -2.7 + Math.sin(i * 1.7) * 0.7,
        0,
        (sofa ? -2.2 : -0.2) + Math.cos(i * 2.1) * 0.55,
      ).project(camera)
      return {
        x: box.x + ((p.x + 1) * box.width) / 2,
        y: box.y + ((1 - p.y) * box.height) / 2,
      }
    })
    await page.mouse.move(points[0].x, points[0].y)
    await page.waitForTimeout(600)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('HeapProfiler.enable')
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
    await page.evaluate(() =>
      window.addEventListener(
        'pointermove',
        () => {
          globalThis.__audit.last = performance.now()
        },
        { capture: true },
      ),
    )
    for (const scenario of ['idle', 'slow', 'burst', 'burst-q', 'burst-r']) {
      await cdp.send('HeapProfiler.collectGarbage')
      const start = await cdp.send('Performance.getMetrics')
      await page.evaluate(() =>
        Object.assign(globalThis.__audit, {
          checks: 0,
          appRenders: 0,
          sceneRenders: 0,
          modelRenders: 0,
          latencies: [],
        }),
      )
      if (scenario === 'burst-q') await page.keyboard.down('q')
      if (scenario === 'burst-r') await page.keyboard.down('r')
      await cdp.send('Profiler.start')
      const data = await page.evaluate(
        async ({ points, scenario }) => {
          const frames = [],
            costs = [],
            canvas = document.querySelector('canvas')
          let previous = 0,
            index = 0,
            events = 0
          for (let frame = 0; frame < 180; frame++)
            await new Promise((resolve) =>
              requestAnimationFrame((now) => {
                if (previous) frames.push(now - previous)
                previous = now
                const start = performance.now()
                for (
                  let n = 0;
                  n < (scenario === 'idle' ? 0 : scenario === 'slow' ? 1 : 8);
                  n++
                ) {
                  const p = points[index++ % points.length]
                  canvas.dispatchEvent(
                    new PointerEvent('pointermove', {
                      clientX: p.x,
                      clientY: p.y,
                      pointerId: 1,
                      pointerType: 'mouse',
                      buttons: 0,
                      bubbles: true,
                    }),
                  )
                  events++
                }
                costs.push(performance.now() - start)
                resolve()
              }),
            )
          const summary = (a) => {
            const sorted = a.slice().sort((a, b) => a - b)
            return {
              mean: a.reduce((x, y) => x + y, 0) / a.length,
              p95: sorted[Math.floor(a.length * 0.95)] ?? null,
              max: sorted.at(-1) ?? null,
            }
          }
          return {
            events,
            frames: summary(frames),
            dispatch: summary(costs),
            checks: globalThis.__audit.checks,
            reactApp: globalThis.__audit.appRenders,
            reactScene: globalThis.__audit.sceneRenders,
            modelRenders: globalThis.__audit.modelRenders,
            publishDelay: summary(globalThis.__audit.latencies),
            renderer: globalThis.__audit.inspect(),
          }
        },
        { points, scenario },
      )
      const { profile } = await cdp.send('Profiler.stop'),
        end = await cdp.send('Performance.getMetrics')
      if (scenario === 'burst-q') await page.keyboard.up('q')
      if (scenario === 'burst-r') await page.keyboard.up('r')
      const value = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0
      data.taskMs =
        (value(end, 'TaskDuration') - value(start, 'TaskDuration')) * 1000
      data.scriptMs =
        (value(end, 'ScriptDuration') - value(start, 'ScriptDuration')) * 1000
      data.heapBytes = value(end, 'JSHeapUsedSize')
      data.fps = 1000 / data.frames.mean
      results.push({ trial, scenario, ...data })
      await writeFile(
        `artifacts/09/${label}-${trial}-${scenario}.cpuprofile`,
        JSON.stringify(profile),
      )
    }
    await context.close()
  }
  await writeFile(
    `artifacts/09/${label}.json`,
    JSON.stringify(
      {
        label,
        source: ref ?? 'working-tree',
        browser: browser.version(),
        viewport: [1440, 1000],
        results,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify(
      results.map(
        ({ trial, scenario, frames, checks, taskMs, reactApp, renderer }) => ({
          trial,
          scenario,
          frames,
          checks,
          taskMs,
          reactApp,
          renderer,
        }),
      ),
    ),
  )
  if (process.argv.includes('--soak'))
    await soakGame(browser, 'http://127.0.0.1:4191/', label)
} finally {
  await browser?.close()
  await new Promise((r) => server.httpServer.close(r))
}
