import { useCallback, useEffect, useState } from 'react'

/**
 * Persistent state mirrored to localStorage. SSR-safe and resilient to JSON errors.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(key)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  const setAndPersist = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* quota / private mode — ignore */
      }
      return next
    })
  }, [key])

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      if (e.newValue == null) {
        setValue(initial)
        return
      }
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [initial, key])

  return [value, setAndPersist]
}
