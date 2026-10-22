import { useEffect, useRef, useState } from 'react'
import App from './App'
import { createHistory, type History } from './history'
import { captureWorld, restoreWorld } from './saveModel'
import { IndexedProgressStorage, SaveQueue, validRevision } from './saveStorage'

const storage = new IndexedProgressStorage()
const describe = (error: unknown) =>
  error instanceof Error ? error.message : 'Ошибка хранилища браузера'
export default function ProgressApp() {
  const [loaded, setLoaded] = useState<{
    history: History
    generation: number
  }>()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const queue = useRef<SaveQueue | null>(null)
  const pending = useRef(0)
  const writable = useRef(false)
  const corruptRevision = useRef(false)
  useEffect(() => {
    let live = true
    storage
      .read()
      .then((record) => {
        if (!live) return
        if (
          record !== undefined &&
          (!record ||
            typeof record !== 'object' ||
            !validRevision(record.revision))
        ) {
          corruptRevision.current = true
          throw new Error('Повреждена ревизия сохранения. Данные не изменены.')
        }
        queue.current = new SaveQueue(storage, record?.revision ?? 0)
        if (record && !Object.hasOwn(record, 'world'))
          throw new Error('Сохранение повреждено. Данные не изменены.')
        const history =
          record && record.world !== null
            ? restoreWorld(record.world)
            : createHistory()
        writable.current = true
        setLoaded({ history, generation: 0 })
        setStatus('saved')
      })
      .catch((e) => {
        if (!live) return
        writable.current = false
        setError(describe(e))
        setStatus('error')
        setLoaded({ history: createHistory(), generation: 0 })
      })
    return () => {
      live = false
    }
  }, [])
  const commit = (history: History) => {
    if (!writable.current || !queue.current) return
    const sequence = ++pending.current
    setStatus('saving')
    queue.current
      .write(captureWorld(history))
      .then(() => {
        if (sequence === pending.current) setStatus('saved')
      })
      .catch((e) => {
        writable.current = false
        setStatus('error')
        setError(
          `Автосохранение остановлено: ${describe(e)} Последняя успешная запись сохранена. Обновите страницу для повторной загрузки.`,
        )
      })
  }
  const reset = async () => {
    if (
      !window.confirm(
        'Начать заново? Весь локальный прогресс этого дома будет удалён.',
      )
    )
      return
    if (!queue.current && !corruptRevision.current) {
      setError(
        'Хранилище недоступно. Прогресс не удалён. Обновите страницу и повторите.',
      )
      return
    }
    setStatus('saving')
    writable.current = false
    pending.current++
    try {
      // Serialize behind in-flight saves. A tombstone keeps a monotonic revision,
      // preventing an old tab from resurrecting deleted progress.
      if (corruptRevision.current) {
        const revision = await storage.repairCorruptRevision()
        queue.current = new SaveQueue(storage, revision)
        corruptRevision.current = false
      } else await queue.current!.write(null, true)
      writable.current = true
      setError('')
      setLoaded((v) => ({
        history: createHistory(),
        generation: (v?.generation ?? 0) + 1,
      }))
      setStatus('saved')
    } catch (e) {
      setStatus('error')
      setError(`Прогресс не удалён: ${describe(e)}`)
    }
  }
  if (!loaded)
    return (
      <div className="fallback" role="status">
        Загрузка дома…
      </div>
    )
  return (
    <>
      <App
        key={loaded.generation}
        initialHistory={loaded.history}
        onWorldCommit={commit}
        onReset={reset}
      />
      <span hidden data-testid="save-status" data-status={status} />
      {error && (
        <div className="save-error" role="alert">
          {error}{' '}
          {!writable.current && 'Изменения в этой вкладке не сохраняются.'}
        </div>
      )}
    </>
  )
}
