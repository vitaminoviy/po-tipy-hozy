import { useCallback, useEffect, useState } from 'react'
import Scene from './Scene'
import {
  catalog,
  initialItems,
  validatePlacement,
  type Item,
} from './placement'

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
  const [items, setItems] = useState<Item[]>(() =>
    initialItems.map((i) => ({ ...i })),
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Item | null>(null)
  const [walls, setWalls] = useState(true)
  const [resetCamera, setResetCamera] = useState(0)
  const [message, setMessage] = useState(
    'Выберите предмет в доме или в списке слева',
  )
  const [help, setHelp] = useState(false)
  const item = items.find((i) => i.id === selected)
  const commit = useCallback(
    (next: Item) =>
      setItems((old) => old.map((i) => (i.id === next.id ? next : i))),
    [],
  )
  const rotate = useCallback(() => {
    if (!item || draft) return
    const next = { ...item, rotation: (item.rotation + 1) % 4 }
    const error = validatePlacement(next, items)
    if (error) setMessage(error + ' — поворот отменён')
    else {
      commit(next)
      setMessage('Предмет повёрнут на 90°')
    }
  }, [item, items, draft, commit])
  useEffect(() => {
    const webapp = window.Telegram?.WebApp
    webapp?.ready()
    webapp?.expand()
    webapp?.disableVerticalSwipes?.()
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'r' &&
        !e.repeat &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault()
        rotate()
      }
      if (e.key === 'Escape') {
        setSelected(null)
        setDraft(null)
        setHelp(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [rotate])
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
          <i /> ПРОТОТИП 0.1
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
                  <small>{i.x < 0 ? 'Гостиная' : 'Спальня'}</small>
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
          <div className="scene">
            <Scene
              items={items}
              selected={selected}
              draft={draft}
              walls={walls}
              resetCamera={resetCamera}
              onSelect={setSelected}
              onDraft={setDraft}
              onCommit={commit}
              onMessage={setMessage}
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
                <kbd>ПКМ</kbd> Вращать камеру
              </p>
              <p>
                <kbd>СКМ</kbd> Перемещать камеру
              </p>
              <p>
                <kbd>Колесо</kbd> Приближать и отдалять
              </p>
              <p>
                <kbd>R</kbd> Повернуть мебель на 90°
              </p>
              <p>
                <kbd>Esc</kbd> Отменить перенос / снять выбор
              </p>
              <small>
                Шаг размещения — 0,25 м. Красная подсветка означает, что место
                занято или выходит за границы. На сенсорном экране: перенос
                одним пальцем, камера — двумя.
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
                {item ? (
                  <output data-testid="pose">
                    X {item.x.toFixed(2)} · Z {item.z.toFixed(2)} ·{' '}
                    {item.rotation * 90}°
                  </output>
                ) : (
                  'Выберите мебель, чтобы начать обустройство'
                )}
              </span>
            </div>
            <button disabled={!item || !!draft} onClick={rotate}>
              ↻ <span>Повернуть</span> <kbd>R</kbd>
            </button>
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
              'Можно разместить — отпустите кнопку мыши'
            : message}
        </span>
        <span>
          ЛКМ — мебель <b>·</b> ПКМ — обзор <b>·</b> Колесо — масштаб
        </span>
      </footer>
    </div>
  )
}
