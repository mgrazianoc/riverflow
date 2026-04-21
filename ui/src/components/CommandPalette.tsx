import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { cn, errorMessage } from '../lib/utils'
import { useShortcut } from '../hooks/useShortcut'
import { useToast } from '../hooks/useToast'

type Item =
  | { kind: 'nav'; id: string; label: string; hint: string; to: string }
  | { kind: 'dag'; id: string; label: string; hint: string; to: string }
  | { kind: 'action'; id: string; label: string; hint: string; run: () => Promise<void> | void }

const NAV_ITEMS: Item[] = [
  { kind: 'nav', id: 'nav:dashboard', label: 'Dashboard', hint: 'g d', to: '/ui' },
  { kind: 'nav', id: 'nav:dags', label: 'DAGs', hint: 'g g', to: '/ui/dags' },
  { kind: 'nav', id: 'nav:system', label: 'System', hint: 'g s', to: '/ui/config' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const toast = useToast()

  const { data: dags = [] } = useQuery({
    queryKey: ['dags'],
    queryFn: api.getDags,
    staleTime: 30_000,
  })

  const close = useCallback(() => {
    setOpen(false)
    setQ('')
    setCursor(0)
  }, [])

  useShortcut('mod+k', (e) => { e.preventDefault(); setOpen((v) => !v) }, { skipInInput: false })

  // Secondary shortcuts when palette is closed
  useShortcut('g', () => { /* no-op root; chords handled below */ }, { enabled: !open })

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const items = useMemo<Item[]>(() => {
    const dagItems: Item[] = dags.map((d) => ({
      kind: 'dag',
      id: `dag:${d.dag_id}`,
      label: d.dag_id,
      hint: d.is_running ? 'running' : d.schedule_display ?? 'manual',
      to: `/ui/dags/${d.dag_id}`,
    }))
    const triggerItems: Item[] = dags.map((d) => ({
      kind: 'action',
      id: `trigger:${d.dag_id}`,
      label: `Trigger ${d.dag_id}`,
      hint: 'run now',
      run: async () => {
        try {
          const run = await api.triggerDag(d.dag_id)
          toast.push(`Triggered ${run.dag_id}`, 'success')
        } catch (err) {
          toast.push(errorMessage(err), 'error')
        }
      },
    }))
    return [...NAV_ITEMS, ...dagItems, ...triggerItems]
  }, [dags, toast])

  const filtered = useMemo(() => {
    if (!q.trim()) return items
    const needle = q.toLowerCase()
    return items
      .map((it) => ({ it, score: score(it.label, needle) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it)
  }, [items, q])

  // Clamp cursor to results; keep in view.
  const [prevQ, setPrevQ] = useState(q)
  if (prevQ !== q) {
    setPrevQ(q)
    setCursor(0)
  }
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  const choose = useCallback((it: Item) => {
    close()
    if (it.kind === 'nav' || it.kind === 'dag') navigate(it.to)
    else void it.run()
  }, [close, navigate])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[14vh] backdrop-blur-[2px]"
      onClick={close}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-md border border-border-bright bg-bg shadow-xl shadow-ink/15"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to DAG, page, or action…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); close() }
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
            if (e.key === 'Enter') {
              e.preventDefault()
              const it = filtered[cursor]
              if (it) choose(it)
            }
          }}
        />

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-muted">No matches</p>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.id}
                data-idx={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(it)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                  i === cursor ? 'bg-bg-raised text-ink' : 'text-ink-secondary',
                )}
              >
                <span className="w-14 shrink-0 font-mono text-[9px] font-medium uppercase tracking-wider text-ink-muted">
                  {it.kind === 'action' ? 'Run' : it.kind === 'dag' ? 'DAG' : 'Go to'}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
                <span className="shrink-0 text-[10px] text-ink-muted">{it.hint}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border bg-bg-raised/60 px-4 py-2 text-[10px] text-ink-muted">
          <div className="flex items-center gap-3">
            <Key>↑↓</Key><span>navigate</span>
            <Key>↵</Key><span>select</span>
            <Key>esc</Key><span>close</span>
          </div>
          <span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-sm border border-border bg-bg-raised px-1 py-px font-mono text-[9px] text-ink-secondary">
      {children}
    </kbd>
  )
}

/** Tiny substring+prefix scorer. No dependencies, good enough for a few hundred items. */
function score(label: string, needle: string): number {
  const l = label.toLowerCase()
  if (l === needle) return 1000
  if (l.startsWith(needle)) return 500
  const idx = l.indexOf(needle)
  if (idx >= 0) return 100 - idx
  // Fuzzy: all chars present in order
  let li = 0
  for (const ch of needle) {
    const found = l.indexOf(ch, li)
    if (found < 0) return 0
    li = found + 1
  }
  return 10
}
