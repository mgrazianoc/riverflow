import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Filter, ArrowDown, X } from './icons'
import { cn } from '../lib/utils'
import type { LogEntry } from '../types'

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-error',
  WARNING: 'text-warning',
  INFO: 'text-ink-muted',
  DEBUG: 'text-ink-muted/60',
}

const LEVEL_BG: Record<string, string> = {
  ERROR: 'bg-error-muted',
  WARNING: 'bg-warning-muted',
}

interface LogViewerProps {
  logs: LogEntry[]
  loading?: boolean
  streaming?: boolean
  className?: string
}

export function LogViewer({ logs, loading, streaming, className }: LogViewerProps) {
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when streaming
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Handle scroll to detect manual scroll-up
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(atBottom)
  }

  const filtered = useMemo(() => {
    let result = logs
    if (levelFilter.size > 0) {
      result = result.filter((e) => levelFilter.has(e.level))
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.task_id.toLowerCase().includes(q),
      )
    }
    return result
  }, [logs, search, levelFilter])

  const levels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of logs) counts.set(e.level, (counts.get(e.level) ?? 0) + 1)
    return counts
  }, [logs])

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12 text-sm text-ink-muted', className)}>
        Loading logs…
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-bg-raised px-3 py-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="w-full rounded-md border border-border bg-bg py-1 pl-7 pr-7 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Level filters */}
        <div className="flex items-center gap-1">
          <Filter size={11} className="text-ink-muted" />
          {Array.from(levels.entries()).map(([level, count]) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                levelFilter.size === 0 || levelFilter.has(level)
                  ? cn(LEVEL_COLORS[level] ?? 'text-ink-muted', 'bg-bg-surface')
                  : 'text-ink-muted/40 bg-transparent',
              )}
            >
              {level} ({count})
            </button>
          ))}
        </div>

        {/* Count */}
        <span className="text-[10px] tabular-nums text-ink-muted">
          {filtered.length}/{logs.length}
        </span>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto text-xs"
      >
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center font-sans text-sm text-ink-muted">
            {logs.length === 0 ? 'No logs captured' : 'No matching logs'}
          </p>
        ) : (
          <div className="divide-y divide-border/20">
            {filtered.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  'px-3 py-1.5 transition-colors hover:bg-bg-hover',
                  LEVEL_BG[entry.level],
                )}
              >
                {/* Meta line: timestamp · LEVEL · task */}
                <div className="flex items-baseline gap-2 font-mono text-[10px] leading-tight">
                  <span className="shrink-0 text-ink-muted/50 select-none">
                    {entry.timestamp.slice(11, 23)}
                  </span>
                  <span className={cn('shrink-0 font-semibold', LEVEL_COLORS[entry.level] ?? 'text-ink-muted')}>
                    {entry.level}
                  </span>
                  <span className="shrink-0 text-accent/70">{entry.task_id}</span>
                </div>
                {/* Message */}
                <div className="mt-0.5 font-mono text-[11px] leading-relaxed text-ink-secondary wrap-break-word whitespace-pre-wrap">
                  <HighlightedMessage message={entry.message} search={search} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scroll-to-bottom indicator */}
      {streaming && !autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
          }}
          className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-bg shadow-md shadow-ink/20"
        >
          <ArrowDown size={10} />
          New logs
        </button>
      )}
    </div>
  )
}

function HighlightedMessage({ message, search }: { message: string; search: string }) {
  if (!search) return <>{message}</>

  const idx = message.toLowerCase().indexOf(search.toLowerCase())
  if (idx === -1) return <>{message}</>

  return (
    <>
      {message.slice(0, idx)}
      <mark className="rounded-sm bg-warning/30 text-warning px-0.5">{message.slice(idx, idx + search.length)}</mark>
      {message.slice(idx + search.length)}
    </>
  )
}
