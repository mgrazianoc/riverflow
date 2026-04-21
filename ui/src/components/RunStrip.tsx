import { Link } from 'react-router'
import { cn } from '../lib/utils'
import type { DAGRun } from '../types'

interface RunStripProps {
  runs: DAGRun[]
  max?: number
  className?: string
  /** Oldest→newest (default) or newest→oldest. */
  direction?: 'asc' | 'desc'
}

const CELL: Record<string, string> = {
  success: 'bg-success/80 hover:bg-success',
  failed: 'bg-error/80 hover:bg-error',
  running: 'bg-accent/90',
  scheduled: 'bg-warning/70',
  idle: 'bg-border-bright/80',
}

/**
 * A compact 20-cell run history strip. The signature detail of Riverflow:
 * one glance tells you a DAG's recent health.
 *
 * Broadsheet variant: square cells on paper, earth tones, hairline baseline
 * rule so empty days read as "no data" rather than a visual void.
 */
export function RunStrip({ runs, max = 20, className, direction = 'asc' }: RunStripProps) {
  // API returns newest-first. Default: oldest→newest, so recent is rightmost.
  const ordered = direction === 'asc' ? [...runs].slice(0, max).reverse() : runs.slice(0, max)
  const padding = Math.max(0, max - ordered.length)

  return (
    <div
      className={cn('relative flex items-end gap-0.5', className)}
      aria-label="Recent runs"
    >
      {/* Baseline rule */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border"
        aria-hidden
      />
      {Array.from({ length: padding }).map((_, i) => (
        <span
          key={`pad-${i}`}
          className="h-4 w-1 bg-border/60"
          aria-hidden
        />
      ))}
      {ordered.map((r) => (
        <Link
          key={r.run_id}
          to={`/ui/runs/${r.run_id}`}
          title={`${r.state} · ${r.run_id}`}
          className={cn(
            'h-4 w-1 transition-opacity hover:opacity-100',
            CELL[r.state] ?? 'bg-border-bright/80',
            r.state === 'running' && 'animate-pulse',
          )}
        />
      ))}
    </div>
  )
}

