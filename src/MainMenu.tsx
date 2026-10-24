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
  const [panel, setPanel] = useState<
    'settings' | 'credits' | 'exit' | 'new' | null
  >(null)
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
          <div className="menu-landscape" aria-hidden="true">
            <svg
              className="menu-living-scene"
              viewBox="0 0 1672 941"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <radialGradient id="window-warmth">
                  <stop stopColor="#ffd28a" stopOpacity=".85" />
                  <stop offset=".35" stopColor="#ffb849" stopOpacity=".3" />
                  <stop offset="1" stopColor="#f5a748" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="lamp-beam" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#ffe4ad" stopOpacity=".18" />
                  <stop offset="1" stopColor="#ffd295" stopOpacity="0" />
                </linearGradient>
              </defs>
              <image
                href={`${import.meta.env.BASE_URL}images/workshop-menu.png`}
                width="1672"
                height="941"
              />
              <g className="menu-window-lights" fill="url(#window-warmth)">
                {[
                  [1015, 395, 72, 65],
                  [1133, 414, 65, 65],
                  [988, 544, 76, 80],
                  [1112, 565, 80, 75],
                  [1215, 577, 78, 80],
                  [1060, 674, 66, 64],
                  [647, 237, 55, 75],
                  [1535, 327, 118, 70],
                ].map(([cx, cy, rx, ry], i) => (
                  <ellipse
                    key={i}
                    className="menu-window-glow"
                    cx={cx}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    style={{
                      animationDelay: `${-i * 1.7}s`,
                      animationDuration: `${6 + i * 0.8}s`,
                    }}
                  />
                ))}
              </g>
              <path
                className="menu-lamp-beam"
                d="M1470 325 L1580 342 L1665 735 Q1460 805 1340 690Z"
                fill="url(#lamp-beam)"
              />
              <g
                className="menu-vines"
                fill="#222719"
                stroke="#33371e"
                strokeWidth="2"
              >
                {[0, 1, 2].map((i) => (
                  <g key={i} transform={`translate(${740 + i * 100} 0)`}>
                    <g
                      className="menu-vine"
                      style={{
                        animationDelay: `${-i * 3}s`,
                      }}
                    >
                      <path
                        d="M0 -15 Q-20 40 4 85 Q20 115 -2 150"
                        fill="none"
                      />
                      <path d="M-4 25Q-45 4 -35 35Q-21 52 -4 25M-1 50Q35 18 29 50Q23 70 -1 50M5 85Q-27 60 -30 87Q-16 109 5 85M8 105Q43 83 35 113Q20 131 8 105M0 139Q-24 118 -22 144Q-10 160 0 139" />
                    </g>
                  </g>
                ))}
              </g>
            </svg>
          </div>
          <div className="menu-dust" aria-hidden="true">
            {Array.from({ length: 15 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${36 + ((i * 11) % 62)}%`,
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
