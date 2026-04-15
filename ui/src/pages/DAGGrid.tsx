import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router'
import { api } from '../api'
import { cn } from '../lib/utils'
import type { TaskState, DAGRunState } from '../types'

/** Map task/run states to cell colours. */
const stateColor: Record<string, string> = {
  success: 'bg-success/80',
  failed: 'bg-error/80',
  running: 'bg-running/80 animate-pulse',
  skipped: 'bg-ink-muted/30',
  upstream_failed: 'bg-error/50',
  timeout: 'bg-warning/60',
  none: 'bg-border/60',
  idle: 'bg-border/60',
  scheduled: 'bg-ink-muted/30',
}

const stateLabel: Record<string, string> = {
  success: 'Success',
  failed: 'Failed',
  running: 'Running',
  skipped: 'Skipped',
  upstream_failed: 'Upstream failed',
  timeout: 'Timeout',
  none: 'Pending',
  idle: 'Idle',
  scheduled: 'Scheduled',
}

function StateCell({ state, runId }: { state: TaskState | DAGRunState; runId: string }) {
  return (
    <Link
      to={`/ui/runs/${runId}`}
      title={stateLabel[state] ?? state}
      className={cn(
        'block h-6 w-6 rounded-[3px] transition-transform hover:scale-125 hover:ring-1 hover:ring-ink-muted/40',
        stateColor[state] ?? 'bg-border/60',
      )}
    />
  )
}

export function DAGGrid() {
  const { dagId } = useParams<{ dagId: string }>()

  const { data: dag } = useQuery({
    queryKey: ['dag', dagId],
    queryFn: () => api.getDag(dagId!),
    enabled: !!dagId,
  })

  const { data: runs = [] } = useQuery({
    queryKey: ['history', dagId, 'grid'],
    queryFn: () => api.getHistory(40, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  if (!dag) return null

  // Rows = tasks (in definition order), columns = runs (newest first → reversed for L→R oldest→newest)
  const taskIds = dag.tasks.map((t) => t.task_id)
  const displayRuns = [...runs].reverse()

  return (
    <div className="overflow-auto px-8 py-6">
      {/* Legend */}
      <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        {['success', 'failed', 'running', 'skipped', 'upstream_failed', 'timeout', 'none'].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('inline-block h-3 w-3 rounded-[2px]', stateColor[s])} />
            {stateLabel[s]}
          </span>
        ))}
      </div>

      {displayRuns.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">No runs recorded yet</p>
      ) : (
        <div className="inline-block">
          <table className="border-separate border-spacing-[3px]">
            {/* Column headers: run index */}
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg pr-4 text-left text-xs font-medium text-ink-muted">
                  Task
                </th>
                {displayRuns.map((r, i) => (
                  <th key={r.run_id} className="pb-1">
                    <Link
                      to={`/ui/runs/${r.run_id}`}
                      className="block text-center text-[10px] tabular-nums text-ink-muted hover:text-ink-secondary"
                      title={r.run_id}
                    >
                      {i + 1}
                    </Link>
                  </th>
                ))}
                {/* Run-level state row header */}
              </tr>
            </thead>
            <tbody>
              {/* Run-level summary row */}
              <tr>
                <td className="sticky left-0 z-10 bg-bg pr-4 text-xs font-medium text-ink-secondary">
                  DAG
                </td>
                {displayRuns.map((r) => (
                  <td key={r.run_id} className="p-0">
                    <StateCell state={r.state} runId={r.run_id} />
                  </td>
                ))}
              </tr>

              {/* Task rows */}
              {taskIds.map((tid) => (
                <tr key={tid}>
                  <td className="sticky left-0 z-10 bg-bg pr-4 text-xs font-mono text-ink-secondary">
                    {tid}
                  </td>
                  {displayRuns.map((r) => {
                    const state = r.task_states[tid] ?? 'none'
                    return (
                      <td key={r.run_id} className="p-0">
                        <StateCell state={state} runId={r.run_id} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
