import type { WorldSave } from './saveModel'

export const SAVE_DATABASE = 'quiet-home-progress'
export type SaveRecord = { revision: number; world: WorldSave | null }
export const validRevision = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v > 0 &&
  v < Number.MAX_SAFE_INTEGER
export interface ProgressStorage {
  read(): Promise<SaveRecord | undefined>
  write(expected: number, world: WorldSave | null): Promise<number>
  repairCorruptRevision?(): Promise<number>
}
export class SaveConflict extends Error {
  constructor() {
    super(
      'Прогресс изменён в другой вкладке. Обновите страницу перед продолжением. Эта вкладка больше не записывает данные.',
    )
  }
}
// The revision and world are compared/written in ONE readwrite transaction.
// A failed transaction retains the entire previous record, including its masks.
export class IndexedProgressStorage implements ProgressStorage {
  private db?: Promise<IDBDatabase>
  private open() {
    return (this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(SAVE_DATABASE, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('progress')
      r.onerror = () => reject(r.error)
      r.onblocked = () =>
        reject(
          new Error(
            'Хранилище заблокировано другой вкладкой. Закройте её и повторите загрузку.',
          ),
        )
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close()
        resolve(r.result)
      }
    }))
  }
  async read(): Promise<SaveRecord | undefined> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readonly')
      const r = tx.objectStore('progress').get('world')
      tx.oncomplete = () => resolve(r.result)
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
    })
  }
  // Explicit recovery refuses a valid record written concurrently by another tab.
  async repairCorruptRevision(): Promise<number> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readwrite', {
        durability: 'strict',
      })
      const store = tx.objectStore('progress'),
        r = store.get('world')
      const revision = Date.now()
      let failure: unknown
      r.onsuccess = () => {
        if (r.result === undefined || validRevision(r.result?.revision)) {
          failure = new SaveConflict()
          tx.abort()
          return
        }
        try {
          store.put({ revision, world: null }, 'world')
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
      tx.oncomplete = () => resolve(revision)
      tx.onabort = () => reject(failure ?? tx.error)
      tx.onerror = () => reject(tx.error)
    })
  }
  async write(expected: number, world: WorldSave | null): Promise<number> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readwrite', {
        durability: 'strict',
      })
      const store = tx.objectStore('progress')
      const r = store.get('world')
      let conflict = false
      let failure: unknown
      r.onsuccess = () => {
        if ((r.result?.revision ?? 0) !== expected) {
          conflict = true
          tx.abort()
        } else {
          try {
            store.put({ revision: expected + 1, world }, 'world')
          } catch (error) {
            failure = error
            tx.abort()
          }
        }
      }
      tx.oncomplete = () => resolve(expected + 1)
      tx.onabort = () =>
        reject(conflict ? new SaveConflict() : (failure ?? tx.error))
      tx.onerror = () => reject(tx.error)
    })
  }
}

export class SaveQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private failed: unknown
  constructor(
    private storage: ProgressStorage,
    public revision: number,
  ) {}
  write(world: WorldSave | null, reset = false) {
    const next = this.tail.then(async () => {
      if (this.failed && !reset) throw this.failed
      try {
        this.revision = await this.storage.write(this.revision, world)
      } catch (error) {
        this.failed = error
        throw error
      }
      this.failed = undefined
    })
    this.tail = next.catch(() => {})
    return next
  }
}
