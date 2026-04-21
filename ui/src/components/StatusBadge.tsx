import type { DAGRunState, TaskState } from '../types'
import { cn } from '../lib/utils'

const stateConfig: Record<string, { dot: string; text: string; label: string }> = {
  success:         { dot: 'bg-success',       text: 'text-success',         label: 'success' },
  failed:          { dot: 'bg-error',         text: 'text-error',           label: 'failed' },
  running:         { dot: 'bg-accent',        text: 'text-accent',          label: 'running' },
  idle:            { dot: 'bg-border-bright', text: 'text-ink-muted',       label: 'idle' },
  scheduled:       { dot: 'bg-warning',       text: 'text-warning',         label: 'scheduled' },
  skipped:         { dot: 'bg-ink-muted',     text: 'text-ink-muted',       label: 'skipped' },
  upstream_failed: { dot: 'bg-error/60',      text: 'text-error/80',        label: 'upstream failed' },
  timeout:         { dot: 'bg-warning',       text: 'text-warning',         label: 'timeout' },
  none:            { dot: 'bg-border-bright', text: 'text-ink-muted',       label: 'pending' },
}

interface StateBadgeProps {
  state: DAGRunState | TaskState | string
  /** Compact = dot only, no label. */
  compact?: boolean
  className?: string
}

export function StateBadge({ state, compact, className }: StateBadgeProps) {
  const cfg = stateConfig[state] ?? stateConfig.none
  const isRunning = state === 'running'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] tabular-nums',
        cfg.text,
        className,
      )}
      title={cfg.label}
    >
      <span className="relative inline-flex size-1.5 shrink-0">
        {isRunning && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-40" />
        )}
        <span className={cn('relative inline-flex size-1.5 rounded-full', cfg.dot)} />
      </span>
      {!compact && cfg.label}
    </span>
  )
}

export function StatusDot({ alive }: { alive: boolean }) {
  return (
    <span className="relative flex size-1.5">
      {alive && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40" />
      )}
      <span
        className={cn(
          'relative inline-flex size-1.5 rounded-full',
          alive ? 'bg-success' : 'bg-ink-muted',
        )}
      />
    </span>
  )
}

