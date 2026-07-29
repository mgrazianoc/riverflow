import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { useMemo } from 'react'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { useUrlState } from '../hooks/useUrlState'
import { formatDuration, cn } from '../lib/utils'
import type { TaskState } from '../types'

const stateColor: Record<string, string> = {
  success: 'bg-success/80',
  failed: 'bg-error/80',
  running: 'bg-accent/80 animate-pulse',
  skipped: 'bg-ink-muted/30',
  upstream_failed: 'bg-error/50',
  timeout: 'bg-warning/60',
  none: 'bg-border/60',
}

export function DAGGantt() {
  const { dagId } = useParams<{ dagId: string }>()

  const { data: runs = [] } = useQuery({
    queryKey: ['history', dagId, 'gantt'],
    queryFn: () => api.getHistory(20, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  // Default to latest completed run, fall back to any latest run
  const latestFinished = runs.find((r) => r.state === 'success' || r.state === 'failed')
  const defaultRunId = latestFinished?.run_id ?? runs[0]?.run_id ?? null
  const [selectedRunId, setSelectedRunId] = useUrlState<string | null>(
    'run',
    null,
    (raw) => raw || null,
    (value) => value,
  )
  const activeRunId = selectedRunId ?? defaultRunId

  const { data: timing } = useQuery({
    queryKey: ['timing', activeRunId],
    queryFn: () => api.getRunTiming(activeRunId!),
    enabled: !!activeRunId,
    refetchInterval: runs.find((r) => r.run_id === activeRunId)?.state === 'running' ? 2000 : false,
  })

  const activeRun = runs.find((r) => r.run_id === activeRunId)

  // Compute timeline bounds
  const { minTs, maxTs, totalMs } = useMemo(() => {
    if (!timing || timing.tasks.length === 0) return { minTs: 0, maxTs: 1, totalMs: 1 }
    let min = Infinity
    let max = -Infinity
    for (const t of timing.tasks) {
      const s = new Date(t.start_time).getTime()
      const e = new Date(t.end_time).getTime()
      if (s < min) min = s
      if (e > max) max = e
    }
    const total = max - min || 1
    return { minTs: min, maxTs: max, totalMs: total }
  }, [timing])

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Run selector */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label htmlFor="gantt-run" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">Run</label>
        <select
          id="gantt-run"
          value={activeRunId ?? ''}
          onChange={(e) => setSelectedRunId(e.target.value || null)}
          className="min-w-0 max-w-full flex-1 rounded-md border border-border bg-bg-raised px-2.5 py-1.5 font-mono text-xs text-ink-secondary focus:border-accent focus:outline-none sm:max-w-md sm:flex-none"
        >
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.slice(0, 20)}… — {r.state}
              {r.duration_seconds != null ? ` (${formatDuration(r.duration_seconds)})` : ''}
            </option>
          ))}
        </select>
        {activeRun && <StateBadge state={activeRun.state} />}
        {activeRun?.duration_seconds != null && (
          <span className="text-xs tabular-nums text-ink-muted">
            Total: {formatDuration(activeRun.duration_seconds)}
          </span>
        )}
      </div>

      {!timing || timing.tasks.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">
          {runs.length === 0 ? 'No runs recorded yet' : 'No task timing data for this run'}
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="min-w-180">
          {/* Time axis header */}
          <div className="mb-2 flex items-end" style={{ paddingLeft: '160px' }}>
            <TimeAxis minTs={minTs} maxTs={maxTs} />
          </div>

          {/* Task bars */}
          <div className="space-y-1">
            {timing.tasks.map((t) => {
              const startMs = new Date(t.start_time).getTime()
              const endMs = new Date(t.end_time).getTime()
              const leftPct = ((startMs - minTs) / totalMs) * 100
              const widthPct = Math.max(((endMs - startMs) / totalMs) * 100, 0.5)
              const durationSec = (endMs - startMs) / 1000
              const state: TaskState = activeRun?.task_states[t.task_id] ?? 'none'

              return (
                <div key={t.task_id} className="flex items-center gap-0">
                  {/* Task label */}
                  <div className="w-40 shrink-0 truncate pr-3 text-right text-xs font-mono text-ink-secondary">
                    {t.task_id}
                  </div>

                  {/* Bar track */}
                  <div className="relative h-7 flex-1 rounded-sm bg-bg-raised">
                    <div
                      className={cn(
                        'absolute top-0.5 bottom-0.5 rounded-sm transition-all',
                        stateColor[state] ?? 'bg-border-bright/40',
                      )}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: '2px' }}
                      title={`${t.task_id}: ${durationSec.toFixed(1)}s`}
                    >
                      {/* Duration label inside bar if wide enough */}
                      {widthPct > 8 && (
                        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium text-bg">
                          {formatDuration(durationSec)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Simple time axis showing evenly-spaced tick labels. */
function TimeAxis({ minTs, maxTs }: { minTs: number; maxTs: number }) {
  const ticks = 6
  const labels: string[] = []
  for (let i = 0; i <= ticks; i++) {
    const t = minTs + ((maxTs - minTs) * i) / ticks
    const d = new Date(t)
    labels.push(d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  }

  return (
    <div className="relative flex h-5 w-full justify-between">
      {labels.map((l, i) => (
        <span key={i} className="text-[11px] tabular-nums text-ink-muted">
          {l}
        </span>
      ))}
    </div>
  )
}
