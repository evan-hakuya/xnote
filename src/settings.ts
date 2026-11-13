export const defaults = {
  enabled: true,
}

export type Settings = typeof defaults
export type Store = ReturnType<typeof createStore>

const KEY = 'xnote:settings'

function read(storage: Pick<Storage, 'getItem'>): Settings {
  const values: Record<string, unknown> = { ...defaults }
  try {
    const stored = JSON.parse(storage.getItem(KEY) ?? '{}')
    for (const [key, fallback] of Object.entries(defaults)) {
      if (typeof stored?.[key] === typeof fallback) values[key] = stored[key]
    }
  } catch {
    // Corrupt stored data: keep the defaults.
  }
  return values as Settings
}

// shortcut: localStorage is lost when the user clears site data, move to GM storage if that hurts
export function createStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const values = read(storage)
  const listeners = new Set<(values: Settings) => void>()
  return {
    get: () => values,
    set<K extends keyof Settings>(key: K, value: Settings[K]) {
      values[key] = value
      storage.setItem(KEY, JSON.stringify(values))
      for (const listener of listeners) listener(values)
    },
    /** Calls the listener now and after every change. */
    subscribe(listener: (values: Settings) => void) {
      listeners.add(listener)
      listener(values)
    },
  }
}
