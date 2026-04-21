import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * URL-backed state. Use for filters/search/view toggles that should
 * survive reloads AND be shareable via link. Reads from the URL
 * querystring; writes with `replace` so the back button doesn't fill
 * up with keystroke-level history.
 *
 * @param key       Querystring key.
 * @param fallback  Value when the param is absent.
 * @param parse     Optional decoder (default: identity string).
 * @param serialize Optional encoder (default: String()). Return `null`
 *                  to omit the key entirely (e.g. default values).
 */
export function useUrlState<T = string>(
  key: string,
  fallback: T,
  parse?: (raw: string) => T,
  serialize?: (v: T) => string | null,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value: T = raw == null ? fallback : parse ? parse(raw) : (raw as unknown as T)

  const setValue = useCallback(
    (v: T | ((prev: T) => T)) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const current: T = (() => {
            const r = prev.get(key)
            return r == null ? fallback : parse ? parse(r) : (r as unknown as T)
          })()
          const resolved = typeof v === 'function' ? (v as (p: T) => T)(current) : v
          const str = serialize ? serialize(resolved) : String(resolved)
          if (str == null || str === '') next.delete(key)
          else next.set(key, str)
          return next
        },
        { replace: true },
      )
    },
    [key, fallback, parse, serialize, setParams],
  )

  return [value, setValue]
}
