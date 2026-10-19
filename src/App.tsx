import { useCallback, useEffect, useState, useReducer } from 'react'
import Scene from './Scene'
import {
  catalog,
  categoryNames,
  isSmall,
  worldPose,
  validatePlacement,
  drawerSpecs,
  type Item,
} from './placement'
import {
  createHistory,
  historyReducer,
  drawerOpeningError,
  type Mode,
  type Interaction,
} from './history'
import { isEditing } from './controls'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        disableVerticalSwipes?: () => void
      }
    }
  }
}
export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    createHistory(),
  )
  const items = history.present
  const [mode, setMode] = useState<Mode>('move')
  const [cancelToken, setCancelToken] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Item | null>(null)
  const [placing, setPlacing] = useState(false)
  const [walls, setWalls] = useState(true)
  const [resetCamera, setResetCamera] = useState(0)
  const [message, setMessage] = useState(
    'Выберите предмет в доме или в списке слева',
  )
  const [help, setHelp] = useState(false)
  const item = items.find((i) => i.id === selected)
  const shownItem =
    (draft ?? item) ? worldPose((draft ?? item)!, items) : undefined
  const commit = useCallback(
    (next: Item) => dispatch({ type: 'change', item: next }),
    [],
  )
  const cancelTransfer = useCallback(() => {
    setDraft(null)
    setPlacing(false)
    setCancelToken((n) => n + 1)
  }, [])
  const switchMode = useCallback(() => {
    cancelTransfer()
    setMode((old) => (old === 'move' ? 'interact' : 'move'))
  }, [cancelTransfer])
  const startPlacement = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id)
      if (!target) return
      if (target.drawerIndex !== undefined) {
        const parent = items.find((i) => i.id === target.surfaceId)
        if (!parent?.drawers?.[target.drawerIndex]) {
          setMessage('Сначала откройте ящик с этим предметом')
          return
        }
      }
      setSelected(id)
      setPlacing(true)
      setDraft(target)
      setMessage(
        isSmall(target)
          ? 'Наведите на поверхность или открытый ящик; WASD — уточнить, Enter — поставить'
          : 'Мышь или WASD — перенос, Shift — точнее, Q/R — поворот, Enter — поставить',
      )
    },
    [items],
  )
  const interact = useCallback(
    (id: string, action: Interaction) => {
      const target = items.find((i) => i.id === id)
      if (!target || draft || mode !== 'interact') return
      if (action.kind === 'take') {
        startPlacement(id)
        return
      }
      if (action.kind === 'drawer') {
        if (!target.drawers?.[action.index]) {
          const error = drawerOpeningError(target, items)
          if (error) {
            setMessage('Ящик нельзя открыть: ' + error)
            return
          }
        }
        dispatch({ type: 'drawer', id, index: action.index })
        setMessage('Состояние ящика изменено')
      } else {
        dispatch({ type: 'lamp', id })
        setMessage(target.lampOn ? 'Торшер выключается' : 'Торшер включается')
      }
    },
    [items, draft, mode, startPlacement],
  )
  const travel = useCallback(
    (type: 'undo' | 'redo') => {
      cancelTransfer()
      dispatch({ type })
      setMessage(
        type === 'undo'
          ? 'Отмена последнего действия'
          : 'Повтор последнего действия',
      )
    },
    [cancelTransfer],
  )
  const rotate = useCallback(
    (direction = 1) => {
      if (!item || (mode === 'interact' && !draft)) return
      const active = draft ?? item
      const next = {
        ...active,
        rotation: (active.rotation + direction + 4) % 4,
      }
      if (draft) {
        setDraft(next)
        return
      }
      const error = validatePlacement(next, items)
      if (error) setMessage(error + ' — поворот отменён')
      else {
        commit(next)
        setMessage('Предмет повёрнут на 90°')
      }
    },
    [item, items, draft, commit, mode],
  )
  useEffect(() => {
    const webapp = window.Telegram?.WebApp
    webapp?.ready()
    webapp?.expand()
    webapp?.disableVerticalSwipes?.()
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target
      if (isEditing(target) || e.altKey) return
      if (e.ctrlKey || e.metaKey) {
        if (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') {
          e.preventDefault()
          travel(e.shiftKey ? 'redo' : 'undo')
        } else if (e.code === 'KeyY' || e.key.toLowerCase() === 'y') {
          e.preventDefault()
          travel('redo')
        }
        return
      }
      if (e.code === 'Tab') {
        e.preventDefault()
        if (!e.repeat) switchMode()
        return
      }
      if (
        (e.code === 'KeyR' || (e.code === 'KeyQ' && draft)) &&
        !e.repeat &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault()
        rotate(e.code === 'KeyQ' ? -1 : 1)
      }
      if (e.key === 'Escape') {
        setSelected(null)
        setDraft(null)
        setPlacing(false)
        setHelp(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [rotate, switchMode, travel, draft])
  return (
    <div className="app">
      <header>
        <a className="brand" href="./">
          <span className="brand-icon">⌂</span>
          <span>
            тихий дом<small>МЕСТО ДЛЯ ВАШИХ ИДЕЙ</small>
          </span>
        </a>
        <div className="project-name">
          Первый дом <span>/</span> Свободное обустройство
        </div>
        <span className="version">
          <i /> ПРОТОТИП 0.3.1
        </span>
      </header>
      <div className="workspace">
        <aside>
          <div className="eyebrow">НЕБОЛЬШОЕ НАЧАЛО</div>
          <h1>
            Дом, в который
            <br />
            хочется вернуться.
          </h1>
          <p className="intro">
            Две комнаты. Мягкий свет.
            <br />И немного места для перемен.
          </p>
          <div className="section-title">
            Предметы в доме{' '}
            <span>{items.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="item-list">
            {items.map((i) => (
              <button
                key={i.id}
                aria-label={catalog[i.kind].name}
                aria-pressed={selected === i.id}
                className={'item ' + (selected === i.id ? 'active' : '')}
                onClick={() => {
                  if (!draft) {
                    setSelected(i.id)
                    setMessage(
                      'Перетащите предмет мышью или нажмите R для поворота',
                    )
                  }
                }}
              >
                <span
                  className="swatch"
                  style={{
                    background: catalog[i.kind].color + '24',
                    color: catalog[i.kind].color,
                  }}
                >
                  {catalog[i.kind].icon}
                </span>
                <span>
                  {catalog[i.kind].name}
                  <small>
                    {worldPose(i, items).x < 0 ? 'Гостиная' : 'Спальня'} ·{' '}
                    {categoryNames[catalog[i.kind].category]}
                  </small>
                </span>
                <span className="item-arrow">↗</span>
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <span>✳</span>
            <p>
              Здесь всё можно переставить.
              <br />
              Начните с любимого уголка.
            </p>
          </div>
        </aside>
        <main>
          <div className="scene-heading">
            <div>
              <span className="eyebrow">ВАШЕ ПРОСТРАНСТВО</span>
              <h2>Маленький дом</h2>
            </div>
            <button
              className="help-button"
              onClick={() => setHelp(!help)}
              aria-expanded={help}
            >
              ? <span>Управление</span>
            </button>
          </div>
          <div className="interaction-tools">
            <div role="group" aria-label="Режим работы">
              <button
                aria-pressed={mode === 'move'}
                onClick={() => {
                  if (mode !== 'move') switchMode()
                }}
              >
                Перемещение
              </button>
              <button
                aria-pressed={mode === 'interact'}
                onClick={() => {
                  if (mode !== 'interact') switchMode()
                }}
              >
                Взаимодействие <kbd>Tab</kbd>
              </button>
            </div>
            <div className="history-tools">
              <button
                aria-label="Отменить действие"
                title="Ctrl+Z"
                disabled={!history.past.length}
                onClick={() => travel('undo')}
              >
                ↶
              </button>
              <button
                aria-label="Повторить действие"
                title="Ctrl+Y / Ctrl+Shift+Z"
                disabled={!history.future.length}
                onClick={() => travel('redo')}
              >
                ↷
              </button>
            </div>
          </div>
          <div className={'scene' + (placing ? ' placing' : '')}>
            <Scene
              items={items}
              selected={selected}
              draft={draft}
              placing={placing}
              walls={walls}
              resetCamera={resetCamera}
              onSelect={setSelected}
              onDraft={setDraft}
              onCommit={commit}
              onMessage={setMessage}
              onPlacementEnd={() => setPlacing(false)}
              mode={mode}
              cancelToken={cancelToken}
              onInteract={interact}
              onTake={startPlacement}
            />
          </div>
          <div className="room-labels">
            <span>
              01 <b>Гостиная</b>
            </span>
            <span>
              02 <b>Спальня</b>
            </span>
          </div>
          <div className="view-tools">
            <button
              onClick={() => setResetCamera((n) => n + 1)}
              title="Вернуть камеру"
              aria-label="Вернуть камеру"
            >
              ⌖ <span>Исходный вид</span>
            </button>
            <button
              className={!walls ? 'pressed' : ''}
              onClick={() => setWalls(!walls)}
              aria-pressed={!walls}
            >
              ▱ <span>{walls ? 'Скрыть стены' : 'Показать стены'}</span>
            </button>
          </div>
          {help && (
            <div className="help">
              <button
                className="close"
                onClick={() => setHelp(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
              <h3>Осмотритесь и обустройтесь</h3>
              <p>
                <kbd>ЛКМ</kbd> Выбрать и перетащить мебель
              </p>
              <p>
                <kbd>СКМ</kbd> Вращать камеру · Q / E — поворот
              </p>
              <p>
                <kbd>ПКМ</kbd> Перемещать камеру · WASD — движение
              </p>
              <p>
                <kbd>Колесо</kbd> Приближать и отдалять
              </p>
              <p>
                <kbd>WASD</kbd> В переносе — мебель; Shift — точнее, Q / R —
                поворот
              </p>
              <p>
                <kbd>Esc</kbd> Отменить перенос / снять выбор
              </p>
              <small>
                Tab — режим взаимодействия: нажимайте на ящики или торшер. Enter
                — установить; Esc — отменить. Shift+WASD без переноса —
                ускорение камеры; Home — исходный вид. Книгу, чашку и коробку
                можно взять и поставить на стол, тумбу или комод или в открытый
                ящик. Для удобства есть кнопки «В ящик»; содержимое закрытого
                ящика можно достать после его открытия. Ctrl+Z — отмена; Ctrl+Y
                / Ctrl+Shift+Z — повтор. Мягкая привязка к сетке 0,25 м: между
                линиями движение свободное. Зелёный контур — можно поставить,
                красный — нельзя. Между мебелью — отступ 22 см. Для ковра под
                мебелью: выберите его в списке, нажмите «Переместить», наведите
                на пол и щёлкните. R поворачивает и предпросмотр; Esc отменяет.
                На сенсорном экране: перенос одним пальцем, камера — двумя.
              </small>
            </div>
          )}
          <div className={'selection ' + (item ? 'has-item' : '')}>
            <div className="selection-icon">
              {item ? catalog[item.kind].icon : '↖'}
            </div>
            <div>
              <small>{item ? 'ВЫБРАННЫЙ ПРЕДМЕТ' : 'ПОПРОБУЙТЕ'}</small>
              <strong>
                {item ? catalog[item.kind].name : 'Поставьте всё по-своему'}
              </strong>
              <span>
                {shownItem ? (
                  <output data-testid="pose">
                    X {shownItem.x.toFixed(2)} · Z {shownItem.z.toFixed(2)} ·{' '}
                    {shownItem.rotation * 90}°
                  </output>
                ) : (
                  'Выберите мебель, чтобы начать обустройство'
                )}
              </span>
              {item && isSmall(item) && (
                <span data-testid="attachment">
                  {shownItem?.surfaceId
                    ? (shownItem.drawerIndex === undefined
                        ? 'На: '
                        : `В ящике ${shownItem.drawerIndex + 1}: `) +
                      catalog[
                        items.find((i) => i.id === shownItem.surfaceId)!.kind
                      ].name
                    : 'Выберите поверхность'}
                </span>
              )}
            </div>
            <div className="selection-actions">
              {mode === 'interact' &&
                item &&
                drawerSpecs(item).map((_, index) => (
                  <button
                    key={index}
                    aria-pressed={!!item.drawers?.[index]}
                    disabled={!!draft}
                    onClick={() => interact(item.id, { kind: 'drawer', index })}
                  >
                    {item.drawers?.[index] ? 'Закрыть' : 'Открыть'} ящик{' '}
                    {index + 1}
                  </button>
                ))}
              {mode === 'interact' && item?.kind === 'lamp' && (
                <button
                  aria-pressed={!!item.lampOn}
                  disabled={!!draft}
                  onClick={() => interact(item.id, { kind: 'lamp' })}
                >
                  {item.lampOn ? 'Выключить' : 'Включить'} торшер
                </button>
              )}
              {mode === 'interact' &&
                item &&
                !draft &&
                items
                  .filter(
                    (child) =>
                      child.surfaceId === item.id &&
                      child.drawerIndex !== undefined &&
                      item.drawers?.[child.drawerIndex],
                  )
                  .map((child) => (
                    <button
                      key={child.id}
                      onClick={() => startPlacement(child.id)}
                    >
                      Достать: {catalog[child.kind].name}
                    </button>
                  ))}
              {draft &&
                isSmall(draft) &&
                items.flatMap((parent) =>
                  drawerSpecs(parent).map(
                    (_, index) =>
                      parent.drawers?.[index] && (
                        <button
                          key={`${parent.id}-${index}`}
                          onClick={() => {
                            const candidate = {
                              ...draft,
                              x: 0,
                              z: 0,
                              surfaceId: parent.id,
                              drawerIndex: index,
                              rotation:
                                (worldPose(draft, items).rotation -
                                  parent.rotation +
                                  4) %
                                4,
                            }
                            setDraft(candidate)
                            setMessage(
                              'Ящик выбран — WASD для уточнения, Enter для установки',
                            )
                          }}
                        >
                          В ящик {index + 1}: {catalog[parent.kind].name}
                        </button>
                      ),
                  ),
                )}
              {draft && (
                <button
                  onClick={() => {
                    const error = validatePlacement(draft, items)
                    if (error) {
                      setMessage(error)
                      return
                    }
                    commit(draft)
                    cancelTransfer()
                  }}
                >
                  Установить <kbd>Enter</kbd>
                </button>
              )}
              {(mode === 'move' || (item && isSmall(item)) || placing) && (
                <button
                  disabled={
                    !item ||
                    (!!draft && !placing) ||
                    (mode === 'interact' && !!item && !isSmall(item))
                  }
                  aria-pressed={placing}
                  onClick={() => {
                    if (placing) {
                      setPlacing(false)
                      setDraft(null)
                      setMessage('Перенос отменён')
                      return
                    }
                    if (item) startPlacement(item.id)
                  }}
                >
                  {placing
                    ? 'Отменить'
                    : item && isSmall(item)
                      ? 'Взять предмет'
                      : 'Переместить'}
                </button>
              )}
              {(mode === 'move' || draft) && (
                <button
                  disabled={!item || (mode === 'interact' && !draft)}
                  onClick={() => rotate()}
                >
                  ↻ <span>Повернуть</span> <kbd>R</kbd>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
      <footer>
        <span
          className={draft && validatePlacement(draft, items) ? 'invalid' : ''}
        >
          <i />
          {draft
            ? validatePlacement(draft, items) ||
              (placing
                ? 'Можно разместить — щёлкните для установки'
                : 'Можно разместить — отпустите кнопку мыши')
            : message}
        </span>
        <span>
          WASD — камера / перенос <b>·</b> СКМ — обзор <b>·</b> ПКМ — сдвиг
        </span>
      </footer>
    </div>
  )
}
