import { useEffect, useRef, useState, type ReactNode } from 'react'
import './mainMenu.css'
import MenuWorkshop from './MenuWorkshop'

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
  const [panel, setPanel] = useState<
    'settings' | 'credits' | 'exit' | 'new' | null
  >(null)
  const [motion, setMotion] = useState(true)
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [backgroundPaused, setBackgroundPaused] = useState(document.hidden)
  useEffect(() => {
    const update = () => setBackgroundPaused(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
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
          data-background-paused={backgroundPaused}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="menu-landscape" aria-hidden="true">
            <MenuWorkshop motion={motion && !reduced && !backgroundPaused} />
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
                [
                  'New Game',
                  () => (hasSave ? setPanel('new') : start(true)),
                  !available,
                ],
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
                  : ''}
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
                    : panel === 'new'
                      ? 'Начать новую игру?'
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
                  <p>
                    Маленькие дома. Бережный ремонт. Уют, который вы создаёте
                    сами.
                  </p>
                  <p>
                    Автор проекта — <strong>@californiaby</strong>
                  </p>
                  <div
                    className="menu-history"
                    tabIndex={0}
                    aria-label="История обновлений"
                  >
                    <h3>История обновлений</h3>
                    <h4>Visual 1.1.4 · Главное меню</h4>
                    <p>
                      Новая вечерняя мастерская: миниатюрный дом, живые растения
                      и тёплый свет. Продолжить ремонт можно прямо из меню.
                    </p>
                    <h4>Visual 1.1.4 · Мебель</h4>
                    <p>
                      В гостиной появился мягкий диван, созданный в Blender. Его
                      можно свободно перемещать и поворачивать.
                    </p>
                    <h4>Visual Foundation 1.0</h4>
                    <p>
                      Дом стал уютнее: обновлены материалы, свет, мебель и
                      площадка инструментов.
                    </p>
                    <h4>Prototype 0.9</h4>
                    <p>
                      Проверены устойчивость игры и плавность работы,
                      подготовлена основа для визуальных обновлений.
                    </p>
                    <h4>Prototype 0.8</h4>
                    <p>
                      Результаты ремонта сохраняются: мебель, чистые полы,
                      покрашенные стены и выбранные покрытия дождутся вашего
                      возвращения.
                    </p>
                  </div>
                </>
              ) : panel === 'new' ? (
                <p>
                  Текущий локальный прогресс будет заменён. Начать ремонт
                  заново?
                </p>
              ) : (
                <p>
                  Чтобы выйти из игры, закройте эту вкладку. Ваш сохранённый
                  прогресс останется в этом браузере.
                </p>
              )}
              <div className="menu-dialog-actions">
                <button
                  className="menu-back"
                  autoFocus={panel === 'new'}
                  onClick={() => setPanel(null)}
                >
                  {panel === 'new' ? 'Отмена' : 'Back to menu'}
                </button>
                {panel === 'new' && (
                  <button
                    className="menu-confirm"
                    onClick={() => {
                      setPanel(null)
                      void start(true)
                    }}
                  >
                    Начать новую
                  </button>
                )}
              </div>
            </dialog>
          )}
        </section>
      )}
    </>
  )
}
