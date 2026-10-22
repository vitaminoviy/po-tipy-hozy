import { test } from 'node:test'
import assert from 'node:assert/strict'
import { connectPlatform, safeInsets, type TelegramApp } from '../src/platform'
function environment(
  run: (
    doc: EventTarget & { hidden: boolean },
    win: EventTarget,
    css: Map<string, string>,
  ) => void,
) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
    oldDoc = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const css = new Map<string, string>(),
    doc = Object.assign(new EventTarget(), {
      hidden: false,
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => css.set(k, v),
          removeProperty: (k: string) => css.delete(k),
        },
      },
    }),
    win = new EventTarget()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: win,
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: doc,
  })
  try {
    run(doc, win, css)
  } finally {
    for (const [key, old] of [
      ['window', oldWindow],
      ['document', oldDoc],
    ] as const) {
      if (old) Object.defineProperty(globalThis, key, old)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}
test('host and device safe areas use the maximum rather than double padding', () => {
  assert.deepEqual(
    safeInsets({
      safeAreaInset: { top: 30, left: 4 },
      contentSafeAreaInset: { top: 15, right: 8 },
    }),
    { top: 30, right: 8, bottom: 0, left: 4 },
  )
})
test('invalid insets and absent bridge safely fall back to zero', () => {
  assert.deepEqual(
    safeInsets({ safeAreaInset: { top: NaN, bottom: -2, right: Infinity } }),
    safeInsets(),
  )
})
test('stable height and changing insets update CSS; unstable events do not resize the scene', () =>
  environment((_doc, _win, css) => {
    const callbacks = new Map<string, Function>(),
      app: TelegramApp = {
        viewportStableHeight: 600,
        onEvent: (e, f) => {
          callbacks.set(e, f)
        },
      }
    const cleanup = connectPlatform(app)
    assert.equal(css.get('--game-height'), '600px')
    app.viewportStableHeight = 400
    callbacks.get('viewportChanged')!({ isStateStable: false })
    assert.equal(css.get('--game-height'), '600px')
    callbacks.get('viewportChanged')!({ isStateStable: true })
    assert.equal(css.get('--game-height'), '400px')
    cleanup()
    assert.equal(css.size, 0)
  }))
test('document hiding and SDK deactivation invoke the shared cancellation paths and unsubscribe', () =>
  environment((doc, win) => {
    let blurs = 0
    win.addEventListener('blur', () => blurs++)
    const callbacks = new Map<string, Function>(),
      off: string[] = []
    const cleanup = connectPlatform({
      onEvent: (e, f) => {
        callbacks.set(e, f)
      },
      offEvent: (e) => {
        off.push(e)
      },
    })
    doc.hidden = true
    doc.dispatchEvent(new Event('visibilitychange'))
    callbacks.get('deactivated')!()
    assert.equal(blurs, 2)
    cleanup()
    doc.dispatchEvent(new Event('visibilitychange'))
    assert.equal(blurs, 2)
    assert.equal(off.length, 4)
  }))
test('old SDK versions do not call unsupported swipe methods; rejected SDK calls do not block the game', () =>
  environment(() => {
    let swipes = 0
    const cleanup = connectPlatform({
      ready: () => {
        throw new Error('old bridge')
      },
      isVersionAtLeast: () => false,
      disableVerticalSwipes: () => swipes++,
    })
    assert.equal(swipes, 0)
    cleanup()
    const supported = connectPlatform({
      isVersionAtLeast: () => true,
      disableVerticalSwipes: () => swipes++,
    })
    assert.equal(swipes, 1)
    supported()
  }))
test('WebGL context loss cancels transient input and removes its listener on cleanup', () =>
  environment((doc, win) => {
    let count = 0
    win.addEventListener('blur', () => count++)
    const cleanup = connectPlatform({})
    doc.dispatchEvent(new Event('webglcontextlost'))
    assert.equal(count, 1)
    cleanup()
    doc.dispatchEvent(new Event('webglcontextlost'))
    assert.equal(count, 1)
  }))
