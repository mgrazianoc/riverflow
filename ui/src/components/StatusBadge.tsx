import type { DAGRunState, TaskState } from '../types'
import { cn } from '../lib/utils'

const stateConfig: Record<string, { dot: string; text: string; bg: string }> = {
  success:         { dot: 'bg-success',  text: 'text-success',  bg: 'bg-success-muted' },
  failed:          { dot: 'bg-error',    text: 'text-error',    bg: 'bg-error-muted' },
  running:         { dot: 'bg-running',  text: 'text-running',  bg: 'bg-running-muted' },
  idle:            { dot: 'bg-ink-muted', text: 'text-ink-muted', bg: 'bg-bg-surface' },
  scheduled:       { dot: 'bg-warning',  text: 'text-warning',  bg: 'bg-warning-muted' },
  skipped:         { dot: 'bg-ink-muted', text: 'text-ink-muted', bg: 'bg-bg-surface' },
  upstream_failed: { dot: 'bg-error',    text: 'text-error',    bg: 'bg-error-muted' },
  timeout:         { dot: 'bg-warning',  text: 'text-warning',  bg: 'bg-warning-muted' },
  none:            { dot: 'bg-ink-muted', text: 'text-ink-muted', bg: 'bg-bg-surface' },
}

export function StateBadge({ state }: { state: DAGRunState | TaskState | string }) {
  const cfg = stateConfig[state] ?? stateConfig.none
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        cfg.bg, cfg.text,
      )}
    >
      <span className={cn('size-1.5 rounded-full', cfg.dot)} />
      {state}
    </span>
  )
}

export function StatusDot({ alive }: { alive: boolean }) {
  return (
    <span className="relative flex size-2">
      {alive && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40" />
      )}
      <span
        className={cn(
          'relative inline-flex size-2 rounded-full',
          alive ? 'bg-success' : 'bg-ink-muted',
        )}
      />
    </span>
  )
}
