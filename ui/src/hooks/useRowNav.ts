import { useEffect, useState, useCallback } from 'react'

/**
 * j/k list navigation over a set of DOM rows selected by `selector`.
 * `enter` clicks the first link or button inside the active row.
 *
 * The hook owns the active index and paints a `data-active="true"`
 * attribute on the selected row so pages can style it (typically
 * `[data-active=true]:bg-bg-raised/70`). It is deliberately DOM-driven
 * rather than virtual — works for any table or list without coupling
 * to the row shape.
 */
export function useRowNav(selector: string, deps: unknown[] = []) {
  const [active, setActive] = useState(0)

  const rows = useCallback(
    () => Array.from(document.querySelectorAll<HTMLElement>(selector)),
    [selector],
  )

  // Reset when data changes
  useEffect(() => {
    setActive(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Paint data-active on the DOM
  useEffect(() => {
    const list = rows()
    list.forEach((el, i) => {
      if (i === active) el.setAttribute('data-active', 'true')
      else el.removeAttribute('data-active')
    })
    list[active]?.scrollIntoView({ block: 'nearest' })
  })

  // Keybindings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

      const list = rows()
      if (list.length === 0) return

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(list.length - 1, i + 1))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        const row = list[active]
        const link = row?.querySelector<HTMLElement>('a, button')
        if (link) {
          e.preventDefault()
          link.click()
        }
      } else if (e.key === 'g') {
        // `gg` → top. Simple one-shot: if next key is g within 400ms, jump.
        const timer = setTimeout(() => window.removeEventListener('keydown', next), 400)
        const next = (ne: KeyboardEvent) => {
          clearTimeout(timer)
          window.removeEventListener('keydown', next)
          if (ne.key === 'g') setActive(0)
        }
        window.addEventListener('keydown', next, { once: true })
      } else if (e.key === 'G') {
        setActive(list.length - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, rows])

  return { active, setActive }
}
