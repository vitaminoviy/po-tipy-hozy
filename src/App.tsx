import {
  useCallback,
  useEffect,
  useState,
  useReducer,
  useRef,
  useMemo,
} from 'react'
import Scene from './Scene'
import { flushSync } from 'react-dom'
import {
  advanceRotation,
  beginRotation,
  normalizeRotation,
  releaseRotation,
  TAP_SECONDS,
  TAP_ANGLE,
  type RotationMotion,
} from './rotation'
import { cleanFraction, dirtPatches, isClean } from './wiping'
import {
  catalog,
  categoryNames,
  isSmall,
  itemName,
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
import { floorSupport } from './grounding'
import { isEditing, primaryInteraction } from './controls'
import {
  availableBins,
  nearestBin,
  trashTypes,
  cleaningProgress,
  roomNames,
  type Disposal,
} from './cleaning'
import {
  rememberPlacement,
  resolveDrop,
  type PlacementSession,
} from './placementSession'

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
  const floorOutputs = useRef(new Map<string, HTMLSpanElement>())
  useEffect(() => {
    for (const d of history.dirt) {
      const output = floorOutputs.current.get(d.id)
      if (output)
        output.textContent = `${Math.floor(cleanFraction(d.mask) * 100)}%`
    }
  }, [history.dirt])
  const selectedTrash = history.trash.find((t) => t.state === 'selected')
  const [disposal, setDisposal] = useState<Disposal | null>(null)
  const disposalRef = useRef<Disposal | null>(null)
  const [binFeedback, setBinFeedback] = useState<{
    id: string
    at: number
  } | null>(null)
  const cancelCleaning = useCallback(() => {
    disposalRef.current = null
    setDisposal(null)
    dispatch({ type: 'trash-cancel' })
  }, [])
  const [mode, setMode] = useState<Mode>('move')
  const [cancelToken, setCancelToken] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraftState] = useState<Item | null>(null)
  // Pointer events and RAF can both run before React publishes another render.
  // Keep one synchronous pose so an angle update never restores old coordinates.
  const draftPose = useRef<Item | null>(null)
  const getDraft = useCallback(() => draftPose.current, [])
  const pendingMove = useRef<(() => Item | null) | null>(null)
  const queueMove = useCallback((update: () => Item | null) => {
    pendingMove.current = update
  }, [])
  const placementSession = useRef<PlacementSession | null>(null)
  const [placing, setPlacing] = useState(false)
  const [walls, setWalls] = useState(true)
  const [resetCamera, setResetCamera] = useState(0)
  const [message, setMessage] = useState(
    'Выберите предмет в доме или в списке слева',
  )
  const [help, setHelp] = useState(false)
  const rotationMotion = useRef<RotationMotion | null>(null)
  const rotationKeys = useRef(new Set<string>())
  const rotationTime = useRef(0)
  const autoRotation = useRef(false)
  const setDraft = useCallback(
    (next: Item | null) => {
      // An explicit pose (e.g. a drawer button) supersedes older pointer input.
      pendingMove.current = null
      draftPose.current = next
      if (next) {
        const previous = placementSession.current
        const session =
          previous?.origin.id === next.id
            ? previous
            : {
                origin: items.find((i) => i.id === next.id) ?? next,
                lastValid: null,
              }
        placementSession.current = rememberPlacement(session, next, items)
      } else {
        placementSession.current = null
        rotationMotion.current = null
        rotationKeys.current.clear()
        autoRotation.current = false
      }
      setDraftState(next)
    },
    [items],
  )
  const flushMove = useCallback(() => {
    const update = pendingMove.current
    pendingMove.current = null
    const next = update?.()
    if (next) setDraft(next)
  }, [setDraft])
  const item = items.find((i) => i.id === selected)
  const placementError = useMemo(
    () => (draft ? validatePlacement(draft, items) : null),
    [draft, items],
  )
  const shownItem =
    (draft ?? item) ? worldPose((draft ?? item)!, items) : undefined
  const commit = useCallback(
    (next: Item) => dispatch({ type: 'change', item: next }),
    [],
  )
  const drop = useCallback(
    (candidate: Item) => {
      const session = placementSession.current
      if (!session) return
      const next = resolveDrop(session, candidate, items)
      if (next) {
        commit(next)
        setMessage(
          validatePlacement(candidate, items)
            ? 'Предмет возвращён в последнюю допустимую позицию'
            : 'Предмет размещён',
        )
      } else setMessage('Размещение отменено: допустимая позиция недоступна')
    },
    [items, commit],
  )
  const cancelTransfer = useCallback(() => {
    setDraft(null)
    setPlacing(false)
    setCancelToken((n) => n + 1)
  }, [setDraft])
  const switchMode = useCallback(() => {
    cancelTransfer()
    cancelCleaning()
    setMode((old) => (old === 'move' ? 'interact' : 'move'))
  }, [cancelTransfer, cancelCleaning])
  const startPlacement = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id)
      if (!target) return
      if (target.kind === 'bin' && disposalRef.current?.binId === id) {
        setMessage(
          'Ведро принимает мусор — дождитесь завершения или нажмите Esc',
        )
        return
      }
      cancelCleaning()
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
          ? 'Наведите мышью на пол, поверхность или открытый ящик; Enter — поставить'
          : 'Мышь — перенос; Q/R — 7,5° или удерживайте для вращения; Enter — поставить',
      )
    },
    [items, setDraft, cancelCleaning],
  )
  const interact = useCallback(
    (id: string, action: Interaction) => {
      const target = items.find((i) => i.id === id)
      if (!target || draft) return
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
    [items, draft, startPlacement],
  )
  const travel = useCallback(
    (type: 'undo' | 'redo') => {
      cancelTransfer()
      cancelCleaning()
      dispatch({ type })
      setMessage(
        type === 'undo'
          ? 'Отмена последнего действия'
          : 'Повтор последнего действия',
      )
    },
    [cancelTransfer, cancelCleaning],
  )
  const pickTrash = (id: string) => {
    if (mode !== 'interact' || draft || disposalRef.current) return
    const target = history.trash.find(
      (t) => t.id === id && t.state !== 'disposed',
    )
    if (!target) return
    setSelected(null)
    dispatch({ type: 'trash-select', id })
    setMessage(
      `Подобрано: ${trashTypes[target.kind].name}. Нажмите на ведро; Esc — вернуть.`,
    )
  }
  const beginDisposal = (trashId: string, binId: string) => {
    if (disposalRef.current) {
      setMessage('Дождитесь окончания полёта; Esc — отменить')
      return
    }
    const target = history.trash.find(
      (t) => t.id === trashId && (t.state === 'room' || t.state === 'selected'),
    )
    const bin = availableBins(items).find((b) => b.id === binId)
    if (!target || !bin || draft) {
      setMessage('Нет доступного ведра. Сначала завершите перенос.')
      return
    }
    const [w, , d] = trashTypes[target.kind].size
    const pending: Disposal = {
      id: trashId,
      binId,
      from: {
        x: target.x,
        z: target.z,
        y: floorSupport({ ...target, w, d }, items),
      },
      to: {
        x: bin.x,
        z: bin.z,
        y: floorSupport({ ...bin, w: 0.472, d: 0.472 }, items) + 0.18,
      },
    }
    disposalRef.current = pending
    setSelected(null)
    dispatch({ type: 'trash-start', id: trashId })
    setDisposal(pending)
    setMessage('Мусор летит в ведро… Esc — отменить')
  }
  const finishDisposal = (pending: Disposal) => {
    if (disposalRef.current !== pending) return
    const target = history.trash.find(
      (t) => t.id === pending.id && t.state === 'disposing',
    )
    if (!target) return
    dispatch({ type: 'trash-dispose', id: pending.id, binId: pending.binId })
    disposalRef.current = null
    setDisposal(null)
    setBinFeedback({ id: pending.binId, at: performance.now() })
    const progress = cleaningProgress(history.trash, target.room)
    setMessage(
      progress.disposed + 1 === progress.total
        ? 'Комната очищена от мусора! ' + roomNames[target.room] + '.'
        : 'Мусор убран. Shift + ЛКМ — быстро убрать следующий; Ctrl+Z — вернуть.',
    )
  }
  const useBin = (binId: string) => {
    if (disposalRef.current) return
    if (!selectedTrash || mode !== 'interact' || draft) {
      setMessage(
        'Ведро принимает мусор: выберите его в режиме «Взаимодействие».',
      )
      return
    }
    beginDisposal(selectedTrash.id, binId)
  }
  const quickClean = (id: string) => {
    if (disposalRef.current) {
      setMessage('Дождитесь окончания полёта; Esc — отменить')
      return
    }
    const target = history.trash.find(
      (t) => t.id === id && t.state !== 'disposed',
    )
    if (!target || draft) return
    const bin = nearestBin(target, items)
    if (!bin) {
      setMessage('В этой комнате нет доступного ведра. Мусор остался на месте.')
      return
    }
    beginDisposal(id, bin.id)
  }
  const selectItem = (id: string | null) => {
    if (id && disposalRef.current?.binId === id) {
      setMessage('Ведро принимает мусор — дождитесь завершения или нажмите Esc')
      return false
    }
    if (selectedTrash || disposal)
      setMessage('Подбор отменён — мусор остался в комнате')
    cancelCleaning()
    setSelected(id)
    return true
  }
  const rotate = useCallback(
    (direction = -1, held = false) => {
      if (!item || (mode === 'interact' && !draft)) return
      const active = draftPose.current ?? item
      if (held) autoRotation.current = false
      if (!draftPose.current) {
        autoRotation.current = true
        setDraft(active)
      }
      const pending = rotationMotion.current
      const angle = pending?.angle ?? active.rotation
      const next = beginRotation(angle, direction, held)
      if (
        pending &&
        !pending.held &&
        pending.direction === direction &&
        pending.elapsed < TAP_SECONDS
      )
        next.target = pending.target + direction * TAP_ANGLE
      rotationMotion.current = next
      rotationTime.current = performance.now()
    },
    [item, draft, mode, setDraft],
  )
  const rotationLive = useRef({ items, setDraft, commit, flushMove })
  rotationLive.current = { items, setDraft, commit, flushMove }
  useEffect(() => {
    let frame = 0
    const tick = (now: number) => {
      const live = rotationLive.current
      const motion = rotationMotion.current
      if (isEditing(document.activeElement)) {
        pendingMove.current = null
        rotationMotion.current = null
        rotationKeys.current.clear()
        frame = requestAnimationFrame(tick)
        return
      }
      const previous = draftPose.current
      const update = pendingMove.current
      pendingMove.current = null
      const latest = update?.() ?? draftPose.current
      if (!latest) {
        rotationMotion.current = null
        autoRotation.current = false
        rotationKeys.current.clear()
      } else if (motion) {
        const next = advanceRotation(
          motion,
          (now - rotationTime.current) / 1000,
        )
        rotationTime.current = now
        const candidate = {
          ...latest,
          rotation: normalizeRotation(next.angle),
        }
        rotationMotion.current = next
        live.setDraft(candidate)
        if (!next.held && next.elapsed >= TAP_SECONDS) {
          rotationMotion.current = null
          if (autoRotation.current) {
            const error = validatePlacement(candidate, live.items)
            if (!error) live.commit(candidate)
            setMessage(
              error ? error + ' — поворот отменён' : 'Предмет повёрнут',
            )
            live.setDraft(null)
            autoRotation.current = false
          }
        }
      } else if (latest !== previous) live.setDraft(latest)
      frame = requestAnimationFrame(tick)
    }
    const up = (e: KeyboardEvent) => {
      rotationKeys.current.delete(e.code)
      if (!['KeyQ', 'KeyR'].includes(e.code)) return
      rotationLive.current.flushMove()
      const motion = rotationMotion.current
      const direction =
        Number(rotationKeys.current.has('KeyQ')) -
        Number(rotationKeys.current.has('KeyR'))
      rotationMotion.current =
        direction && draftPose.current
          ? beginRotation(
              motion?.angle ?? draftPose.current!.rotation,
              direction,
            )
          : motion
            ? releaseRotation(motion)
            : null
      if (!rotationMotion.current && motion && draftPose.current) {
        const live = rotationLive.current
        flushSync(() =>
          live.setDraft({
            ...draftPose.current!,
            rotation: normalizeRotation(motion.angle),
          }),
        )
      }
      rotationTime.current = performance.now()
    }
    const clear = () => {
      rotationMotion.current = null
      rotationKeys.current.clear()
    }
    const visibility = () => {
      if (document.hidden) clear()
    }
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', visibility)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
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
      if (e.code === 'KeyE' && !e.repeat && !draft) {
        const action = primaryInteraction(item)
        if (item && action) {
          e.preventDefault()
          interact(item.id, action)
        }
        return
      }
      if (
        draft &&
        (e.code === 'KeyR' || e.code === 'KeyQ') &&
        !e.repeat &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault()
        flushMove()
        rotationKeys.current.add(e.code)
        const direction =
          Number(rotationKeys.current.has('KeyQ')) -
          Number(rotationKeys.current.has('KeyR'))
        if (direction) rotate(direction, true)
        else {
          const motion = rotationMotion.current
          rotationMotion.current = null
          if (motion && draft)
            flushSync(() =>
              setDraft({
                ...draftPose.current!,
                rotation: normalizeRotation(motion.angle),
              }),
            )
        }
      }
      if (e.key === 'Escape') {
        cancelCleaning()
        if (selectedTrash || disposal)
          setMessage('Подбор отменён — мусор остался в комнате')
        setSelected(null)
        setDraft(null)
        setPlacing(false)
        setHelp(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [
    rotate,
    switchMode,
    travel,
    draft,
    item,
    interact,
    setDraft,
    flushMove,
    cancelCleaning,
    selectedTrash,
    disposal,
  ])
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
          <i /> ПРОТОТИП 0.5.1
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
                aria-label={itemName(i)}
                aria-pressed={selected === i.id}
                className={'item ' + (selected === i.id ? 'active' : '')}
                onClick={() => {
                  if (!draft) {
                    if (selectItem(i.id))
                      setMessage(
                        'E — взаимодействовать; для переноса перетащите мышью или нажмите «Переместить»',
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
                  {itemName(i)}
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
              dirt={history.dirt}
              onWipeBegin={() => {
                cancelCleaning()
                setSelected(null)
                setMessage(
                  'Удерживайте ЛКМ и двигайте тряпку по грязи; Esc — отменить жест',
                )
              }}
              onWipeCommit={(id, mask) => {
                dispatch({ type: 'wipe', id, mask })
                setMessage(
                  isClean(mask)
                    ? 'Поверхность очищена!'
                    : 'Протирание завершено. Продолжайте с оставшихся участков; Ctrl+Z — отменить жест.',
                )
              }}
              onWipeProgress={(id, fraction) => {
                const output = floorOutputs.current.get(id)
                if (output)
                  output.textContent = `${Math.floor(fraction * 100)}%`
              }}
              items={items}
              selected={selected}
              draft={draft}
              getDraft={getDraft}
              onMove={queueMove}
              flushMove={flushMove}
              placing={placing}
              walls={walls}
              resetCamera={resetCamera}
              onSelect={selectItem}
              onDraft={setDraft}
              onCommit={commit}
              onDrop={drop}
              onMessage={setMessage}
              onPlacementEnd={() => setPlacing(false)}
              mode={mode}
              cancelToken={cancelToken}
              onInteract={interact}
              onTake={startPlacement}
              trash={history.trash}
              disposal={disposal}
              binFeedback={binFeedback}
              onTrashPick={pickTrash}
              onBin={useBin}
              onQuickClean={quickClean}
              onDisposalComplete={finishDisposal}
            />
          </div>
          <div className="room-labels" aria-label="Прогресс уборки">
            {(['living', 'bedroom'] as const).map((room) => {
              const progress = cleaningProgress(history.trash, room)
              return (
                <span key={room} data-testid={`cleaning-${room}`}>
                  <b>{roomNames[room]}</b> · Убрано {progress.disposed} /{' '}
                  {progress.total}
                  {' · Пол '}
                  <span
                    data-testid={`floor-${room}`}
                    ref={(node) => {
                      const id = dirtPatches.find((d) => d.room === room)!.id
                      if (node) floorOutputs.current.set(id, node)
                      else floorOutputs.current.delete(id)
                    }}
                  >
                    {Math.floor(
                      cleanFraction(
                        history.dirt.find((d) => d.id === `floor-${room}`)!
                          .mask,
                      ) * 100,
                    )}
                    %
                  </span>
                </span>
              )
            })}
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
                <kbd>СКМ</kbd> Вращать камеру по горизонтали и вертикали
              </p>
              <p>
                <kbd>ПКМ</kbd> Перемещать камеру · WASD — движение
              </p>
              <p>
                <kbd>Колесо</kbd> Приближать и отдалять
              </p>
              <p>
                <kbd>Мышь</kbd> Перенос предмета; Q / R — 7,5° или удержание
              </p>
              <p>
                <kbd>Esc</kbd> Отменить перенос / снять выбор
              </p>
              <small>
                Пол: в режиме «Взаимодействие» удерживайте ЛКМ и протирайте
                грязь мышью. Esc отменяет текущий жест; Ctrl+Z возвращает
                стёртую грязь. Shift + ЛКМ по мусору — быстрая уборка в любом
                режиме. Уборка: включите «Взаимодействие», нажмите на мусор,
                затем на ведро. Esc отменяет подбор; Ctrl+Z возвращает
                выброшенный мусор. E — действие выбранного предмета: ящик,
                торшер или взять вещь. Tab — переключить режим для кликов мышью.
                Enter — установить; Esc — отменить. Shift+WASD — ускорение
                камеры; Home — исходный вид. Книгу, чашку и коробку можно взять
                и поставить на пол, ковёр, стол, тумбу, комод, матрас или
                сиденье либо в открытый ящик. Для удобства есть кнопки «В ящик»;
                содержимое закрытого ящика можно достать после его открытия.
                Ctrl+Z — отмена; Ctrl+Y / Ctrl+Shift+Z — повтор. Мягкая привязка
                к сетке 0,25 м: между линиями движение свободное. Зелёный контур
                — можно поставить, красный — нельзя. Между мебелью — зазор 2 см.
                Для ковра под мебелью: выберите его в списке, нажмите
                «Переместить», наведите на пол и щёлкните. R поворачивает и
                предпросмотр; Esc отменяет. На сенсорном экране: перенос одним
                пальцем, камера — двумя.
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
                {item ? itemName(item) : 'Поставьте всё по-своему'}
              </strong>
              <span>
                {shownItem ? (
                  <output data-testid="pose">
                    X {shownItem.x.toFixed(2)} · Z {shownItem.z.toFixed(2)} ·{' '}
                    {Number((shownItem.rotation * 90).toFixed(1))}°
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
                    : 'На полу'}
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
                              surfaceZone: undefined,
                              drawerIndex: index,
                              rotation:
                                (worldPose(draft, items).rotation -
                                  parent.rotation +
                                  4) %
                                4,
                            }
                            setDraft(candidate)
                            setMessage(
                              'Ящик выбран — Enter для установки в центре; другую точку выберите мышью',
                            )
                          }}
                        >
                          В ящик {index + 1}: {itemName(parent)}
                        </button>
                      ),
                  ),
                )}
              {draft && (
                <button
                  onClick={() => {
                    flushMove()
                    const candidate = draftPose.current
                    if (!candidate) return
                    const error = validatePlacement(candidate, items)
                    if (error) {
                      setMessage(error)
                      return
                    }
                    commit(candidate)
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
                  ↻ <span>Повернуть</span> {draft && <kbd>Q / R</kbd>}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
      <footer>
        <span role="status" className={placementError ? 'invalid' : ''}>
          <i />
          {draft
            ? placementError ||
              (placing
                ? 'Можно разместить — щёлкните для установки'
                : 'Можно разместить — отпустите кнопку мыши')
            : message}
        </span>
        <span>
          Shift + ЛКМ — мусор <b>·</b> WASD — камера <b>·</b> СКМ — обзор{' '}
          <b>·</b> ПКМ — сдвиг
        </span>
      </footer>
    </div>
  )
}
