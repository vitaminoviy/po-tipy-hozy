import { useEffect, useRef, useState, type ReactNode } from 'react'
import './mainMenu.css'

function Flourish() {
  return (
    <svg className="menu-flourish" viewBox="0 0 70 32" aria-hidden="true">
      <path d="M3 22C20 26 35 7 64 16M22 21C10 19 8 10 10 5C22 6 27 12 22 21ZM37 15C29 7 35 2 41 2C45 9 43 12 37 15ZM48 16C47 25 57 29 64 24C61 17 54 15 48 16Z" />
    </svg>
  )
}

export default function MainMenu({
  children,
  hasSave,
  available,
  error,
  onStart,
}: {
  children: ReactNode
  hasSave: boolean
  available: boolean
  error: string
  onStart: (fresh: boolean) => Promise<boolean>
}) {
  const [visible, setVisible] = useState(true)
  const [entering, setEntering] = useState(false)
  const [ready, setReady] = useState(false)
  const [panel, setPanel] = useState<'settings' | 'credits' | 'exit' | null>(
    null,
  )
  const [motion, setMotion] = useState(true)
  const world = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const busy = useRef(false)
  const lastFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!panel) return
    lastFocus.current = document.activeElement as HTMLElement
    dialog.current?.showModal()
    return () => {
      dialog.current?.close()
      lastFocus.current?.focus()
    }
  }, [panel])
  useEffect(() => {
    if (!entering) return
    let frame = 0
    let settled = false
    const check = () => {
      const canvas = world.current?.querySelector('canvas')
      const assets = canvas?.dataset.furnitureAssets
      const failed = Array.from(
        world.current?.querySelectorAll('.fallback:not([role="status"])') ?? [],
      ).some((n) => !n.closest('canvas'))
      if (
        settled ||
        (!failed &&
          !(
            canvas?.dataset.sceneReady === 'true' &&
            (assets === 'ready' || assets === 'error')
          ))
      )
        return
      settled = true
      observer.disconnect()
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setReady(true))
      })
    }
    const observer = new MutationObserver(check)
    observer.observe(world.current!, {
      subtree: true,
      childList: true,
      attributes: true,
    })
    check()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [entering])
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => setVisible(false), 650)
    return () => clearTimeout(timer)
  }, [ready])
  const start = async (fresh: boolean) => {
    if (busy.current) return
    busy.current = true
    try {
      if (await onStart(fresh)) setEntering(true)
    } finally {
      busy.current = false
    }
  }
  return (
    <>
      <div ref={world} inert={visible} aria-hidden={visible || undefined}>
        {children}
      </div>
      {visible && (
        <section
          className="main-menu"
          aria-label="Главное меню"
          data-leaving={ready}
          data-motion={motion}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="menu-landscape" aria-hidden="true" />
          <div className="menu-light" aria-hidden="true" />
          <div className="menu-dust" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${42 + i * 6}%`,
                  top: `${25 + ((i * 13) % 60)}%`,
                  animationDelay: `${-i * 2}s`,
                }}
              />
            ))}
          </div>
          <div className="title-content">
            <p className="menu-eyebrow">A LITTLE PLACE TO BEGIN AGAIN</p>
            <h1>Quiet Home</h1>
            <div className="menu-divider">
              <span />
              <Flourish />
              <span />
            </div>
            <nav aria-label="Main menu">
              {[
                ['New Game', () => start(true), !available],
                ['Continue', () => start(false), !available || !hasSave],
                ['Settings', () => setPanel('settings'), false],
                ['Credits', () => setPanel('credits'), false],
                ['Exit', () => setPanel('exit'), false],
              ].map(([label, action, disabled]) => (
                <button
                  key={String(label)}
                  disabled={Boolean(disabled) || entering}
                  onClick={action as () => void}
                >
                  <Flourish />
                  <span>{String(label)}</span>
                  <Flourish />
                </button>
              ))}
            </nav>
            <p className="menu-caption" role="status">
              {entering
                ? 'Открываем ваш дом…'
                : !available && !error
                  ? 'Проверяем сохранение…'
                  : 'Немного заботы. Немного тепла. Ваш тихий дом.'}
            </p>
            {error && (
              <p className="menu-error" role="alert">
                {error} Сохранение не перезаписано. Обновите страницу для
                повторной попытки.
              </p>
            )}
          </div>
          <span className="menu-edition">
            ТИХИЙ ДОМ <span>·</span> A COZY LITTLE WORLD
          </span>
          {panel && (
            <dialog
              ref={dialog}
              className="menu-dialog"
              onCancel={() => setPanel(null)}
              aria-labelledby="menu-panel-title"
            >
              <p className="menu-eyebrow">QUIET HOME</p>
              <h2 id="menu-panel-title">
                {panel === 'settings'
                  ? 'Settings'
                  : panel === 'credits'
                    ? 'Credits'
                    : 'До скорой встречи'}
              </h2>
              {panel === 'settings' ? (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={motion}
                      onChange={(e) => setMotion(e.target.checked)}
                    />{' '}
                    Анимация главного меню
                  </label>
                  <p>
                    Системное предпочтение уменьшенной анимации всегда
                    учитывается. Настройка действует до закрытия страницы.
                  </p>
                </>
              ) : panel === 'credits' ? (
                <>
                  <p>«Тихий дом» — игра о заботе, восстановлении и уюте.</p>
                  <p>
                    Автор проекта — vitaminoviy.
                    <br />
                    Разработка — совместно с OpenAI Codex.
                  </p>
                  <p>
                    Фон подготовлен по предоставленному автором референсу с
                    помощью генеративного редактирования.
                  </p>
                </>
              ) : (
                <p>
                  Чтобы выйти из игры, закройте эту вкладку. Ваш сохранённый
                  прогресс останется в этом браузере.
                </p>
              )}
              <button className="menu-back" onClick={() => setPanel(null)}>
                Back to menu
              </button>
            </dialog>
          )}
        </section>
      )}
    </>
  )
}
