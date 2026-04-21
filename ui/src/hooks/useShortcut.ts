import { useEffect, useRef } from 'react'

type ShortcutHandler = (e: KeyboardEvent) => void

interface ShortcutOptions {
  /** When true, ignore shortcut if focus is in an input/textarea/contenteditable. Default: true */
  skipInInput?: boolean
  /** Set to false to disable temporarily. */
  enabled?: boolean
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (t.isContentEditable) return true
  return false
}

/**
 * Bind a single keyboard shortcut. Pattern is a key string like 'k', '/', 'mod+k'.
 * 'mod' resolves to ⌘ on macOS and Ctrl elsewhere.
 */
export function useShortcut(
  pattern: string,
  handler: ShortcutHandler,
  { skipInInput = true, enabled = true }: ShortcutOptions = {},
) {
  useEffect(() => {
    if (!enabled) return

    const parts = pattern.toLowerCase().split('+').map((p) => p.trim())
    const wantMod = parts.includes('mod') || parts.includes('cmd') || parts.includes('ctrl')
    const wantShift = parts.includes('shift')
    const wantAlt = parts.includes('alt')
    const key = parts.filter((p) => !['mod', 'cmd', 'ctrl', 'shift', 'alt'].includes(p))[0] ?? ''

    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const modPressed = isMac ? e.metaKey : e.ctrlKey

      if (wantMod !== modPressed) return
      if (wantShift !== e.shiftKey) return
      if (wantAlt !== e.altKey) return
      if (e.key.toLowerCase() !== key) return
      if (skipInInput && !wantMod && isEditableTarget(e.target)) return

      handler(e)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pattern, handler, skipInInput, enabled])
}

/**
 * Two-key sequence shortcut (Vim-style leader), e.g. `g d` → dashboard.
 * Resets after 800ms of inactivity. Skips inside text inputs.
 */
export function useSequenceShortcut(
  leader: string,
  key: string,
  handler: ShortcutHandler,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const armedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const L = leader.toLowerCase()
    const K = key.toLowerCase()

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return

      if (!armedRef.current) {
        if (e.key.toLowerCase() === L) {
          armedRef.current = true
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => { armedRef.current = false }, 800)
        }
        return
      }

      // Armed — consume next keypress
      if (timerRef.current) clearTimeout(timerRef.current)
      armedRef.current = false
      if (e.key.toLowerCase() === K) {
        e.preventDefault()
        handler(e)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [leader, key, handler, enabled])
}
