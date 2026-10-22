type Insets = { top?: number; right?: number; bottom?: number; left?: number }
export type TelegramApp = {
  ready?: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  isVersionAtLeast?: (version: string) => boolean
  viewportStableHeight?: number
  safeAreaInset?: Insets
  contentSafeAreaInset?: Insets
  onEvent?: (event: string, callback: (...args: any[]) => void) => void
  offEvent?: (event: string, callback: (...args: any[]) => void) => void
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramApp }
  }
}
export function safeInsets(app?: TelegramApp) {
  const value = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
  return Object.fromEntries(
    ['top', 'right', 'bottom', 'left'].map((key) => [
      key,
      Math.max(
        value(app?.safeAreaInset?.[key as keyof Insets]),
        value(app?.contentSafeAreaInset?.[key as keyof Insets]),
      ),
    ]),
  ) as Record<keyof Required<Insets>, number>
}
// Reuse existing cancellation paths. Hiding a WebView need not emit window.blur.
export function connectPlatform(app = window.Telegram?.WebApp) {
  const root = document.documentElement
  const pause = () => window.dispatchEvent(new Event('blur'))
  const hidden = () => {
    if (document.hidden) pause()
  }
  const viewport = (event?: { isStateStable?: boolean }) => {
    if (event?.isStateStable === false) return
    const h = app?.viewportStableHeight
    if (typeof h === 'number' && Number.isFinite(h) && h > 0)
      root.style.setProperty('--game-height', `${h}px`)
    else root.style.removeProperty('--game-height')
    for (const [key, value] of Object.entries(safeInsets(app)))
      root.style.setProperty(`--game-safe-${key}`, `${value}px`)
  }
  const events: [string, (...args: any[]) => void][] = [
    ['deactivated', pause],
    ['viewportChanged', viewport],
    ['safeAreaChanged', viewport],
    ['contentSafeAreaChanged', viewport],
  ]
  const subscribed: typeof events = []
  // SDK presence is not proof of version support. Missing/old bridges must not
  // prevent a normal browser game from opening.
  for (const method of ['ready', 'expand'] as const) {
    try {
      app?.[method]?.()
    } catch {}
  }
  try {
    if (app?.isVersionAtLeast?.('7.7')) app.disableVerticalSwipes?.()
  } catch {}
  for (const pair of events) {
    try {
      app?.onEvent?.(...pair)
      subscribed.push(pair)
    } catch {}
  }
  viewport()
  document.addEventListener('visibilitychange', hidden)
  document.addEventListener('webglcontextlost', pause, { capture: true })
  return () => {
    document.removeEventListener('visibilitychange', hidden)
    document.removeEventListener('webglcontextlost', pause, { capture: true })
    for (const pair of subscribed) {
      try {
        app?.offEvent?.(...pair)
      } catch {}
    }
    root.style.removeProperty('--game-height')
    for (const key of ['top', 'right', 'bottom', 'left'])
      root.style.removeProperty(`--game-safe-${key}`)
  }
}
