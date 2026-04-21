import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router'
import { useState } from 'react'
import { api } from '../api'
import { LogViewer } from '../components/LogViewer'
import { StateBadge } from '../components/StatusBadge'
import { formatDuration, relativeTime, cn } from '../lib/utils'

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const [selectedTask, setSelectedTask] = useState<string | null>(null)

  // Find the run in history
  const { data: runs = [] } = useQuery({
    queryKey: ['history'],
    queryFn: () => api.getHistory(200),
    refetchInterval: 5000,
  })

  const run = runs.find((r) => r.run_id === runId)

  const { data: logs } = useQuery({
    queryKey: ['logs', runId, selectedTask],
    queryFn: () => api.getRunLogs(runId!, selectedTask ?? undefined),
    enabled: !!runId,
    refetchInterval: run?.state === 'running' ? 2000 : false,
  })

  if (!run) {
    return (
      <div className="mx-auto max-w-7xl px-8 pt-10">
        <Link
          to="/ui"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink"
        >
          ← Back
        </Link>
        <p className="mt-6 font-mono text-[11px] text-ink-muted">Run not found or still loading…</p>
      </div>
    )
  }

  const taskIds = Object.keys(run.task_states).sort()

  return (
    <div className="flex h-full flex-col">
      {/* Header — editorial, matches DAGDetail rhythm */}
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto max-w-7xl px-8 pt-8 pb-5">
          <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            <Link to={`/ui/dags/${run.dag_id}`} className="transition-colors hover:text-ink">
              ← {run.dag_id}
            </Link>
            <span>Run</span>
          </div>

          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-mono text-[20px] font-medium tracking-tight text-ink">
                {run.run_id}
              </h1>
              <div className="mt-2 flex items-center gap-4">
                <StateBadge state={run.state} />
                <span className="font-mono text-[11px] text-ink-muted">
                  {run.start_time && <>started {relativeTime(run.start_time)}</>}
                </span>
                {run.duration_seconds != null && (
                  <span className="font-mono text-[11px] text-ink-muted">
                    <span className="text-ink-secondary">{formatDuration(run.duration_seconds)}</span>
                  </span>
                )}
                <span className="font-mono text-[11px] text-ink-muted">
                  <span className="text-ink-secondary">{taskIds.length}</span> tasks
                </span>
              </div>
            </div>
          </div>

          {run.error && (
            <pre className="mt-4 border-l-2 border-error bg-error-muted px-4 py-2 text-[11px] text-error whitespace-pre-wrap">
              {run.error}
            </pre>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Task sidebar */}
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-bg-raised/60">
          <div className="px-4 pt-4">
            <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Tasks
            </div>
            <button
              onClick={() => setSelectedTask(null)}
              className={cn(
                'mt-2 w-full rounded-sm px-2 py-1 text-left text-[12px] transition-colors',
                selectedTask === null
                  ? 'bg-bg-surface text-ink'
                  : 'text-ink-secondary hover:bg-bg-hover',
              )}
            >
              All tasks
            </button>
          </div>
          <div className="mt-1 space-y-px px-4 pb-4">
            {taskIds.map((tid) => (
              <button
                key={tid}
                onClick={() => setSelectedTask(tid)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors',
                  selectedTask === tid
                    ? 'bg-bg-surface text-ink'
                    : 'text-ink-secondary hover:bg-bg-hover',
                )}
              >
                <span className="truncate font-mono text-[11px]">{tid}</span>
                <StateBadge state={run.task_states[tid]} compact />
              </button>
            ))}
          </div>
        </aside>

        {/* Log viewer */}
        <LogViewer
          logs={logs?.logs ?? []}
          loading={!logs}
          streaming={run.state === 'running'}
          className="flex-1"
        />
      </div>
    </div>
  )
}
