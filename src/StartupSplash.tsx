import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './startupSplash.css'

/** One presentation per page load; the world and IndexedDB load underneath. */
export default function StartupSplash({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true)
  const [finished, setFinished] = useState(false)
  const [ready, setReady] = useState(false)
  const world = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = world.current!
    let frame = 0
    let settled = false
    const check = () => {
      const canvas = element.querySelector('canvas')
      const assets = canvas?.dataset.furnitureAssets
      const sceneReady =
        canvas?.dataset.sceneReady === 'true' &&
        (assets === 'ready' || assets === 'error')
      // Existing WebGL / React error UI must remain reachable, too.
      const failure = Array.from(
        element.querySelectorAll('.fallback:not([role="status"])'),
      ).some((node) => !node.closest('canvas'))
      if ((!sceneReady && !failure) || settled) return
      settled = true
      observer.disconnect()
      // Allow the committed scene to paint before exposing it.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setReady(true))
      })
    }
    const observer = new MutationObserver(check)
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
    })
    check()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    const dismiss = (event: Event) => {
      // The gesture used to skip must not select furniture or move the camera.
      event.preventDefault()
      event.stopImmediatePropagation()
      setFinished(true)
    }
    const timer = window.setTimeout(() => setFinished(true), 2100)
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('keydown', dismiss, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('keydown', dismiss, true)
    }
  }, [visible])

  useLayoutEffect(() => {
    if (!finished || !ready) return
    const timer = window.setTimeout(() => setVisible(false), 200)
    return () => window.clearTimeout(timer)
  }, [finished, ready])

  return (
    <>
      <div ref={world} inert={visible} aria-hidden={visible || undefined}>
        {children}
      </div>
      {visible && (
        <div
          className="startup-splash"
          data-exiting={finished && ready}
          data-finished={finished}
          role="status"
          aria-label="Quiet Home"
        >
          <img
            src={`${import.meta.env.BASE_URL}images/quiet-home-splash.png`}
            alt="Quiet Home"
            draggable={false}
            fetchPriority="high"
            onError={() => setFinished(true)}
          />
          {finished && !ready && <span>Загрузка дома…</span>}
        </div>
      )}
    </>
  )
}
