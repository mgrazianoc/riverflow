import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { useState, useMemo } from 'react'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { formatDuration, cn } from '../lib/utils'
import type { TaskState } from '../types'

const stateColor: Record<string, string> = {
  success: 'bg-emerald-500/80',
  failed: 'bg-red-500/80',
  running: 'bg-blue-500/70 animate-pulse',
  skipped: 'bg-zinc-600/60',
  upstream_failed: 'bg-orange-500/60',
  timeout: 'bg-amber-500/60',
  none: 'bg-zinc-700/40',
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
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
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
    <div className="px-8 py-6">
      {/* Run selector */}
      <div className="mb-5 flex items-center gap-3">
        <label className="text-xs font-medium text-ink-muted">Run</label>
        <select
          value={activeRunId ?? ''}
          onChange={(e) => setSelectedRunId(e.target.value || null)}
          className="rounded-md border border-border bg-bg-raised px-2.5 py-1.5 text-xs text-ink-secondary focus:border-accent focus:outline-none"
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
        <div>
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
                        stateColor[state] ?? 'bg-zinc-700/40',
                      )}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: '2px' }}
                      title={`${t.task_id}: ${durationSec.toFixed(1)}s`}
                    >
                      {/* Duration label inside bar if wide enough */}
                      {widthPct > 8 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/90">
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
        <span key={i} className="text-[10px] tabular-nums text-ink-muted">
          {l}
        </span>
      ))}
    </div>
  )
}
