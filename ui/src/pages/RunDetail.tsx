import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
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
      <div className="px-8 py-8">
        <Link to="/ui" className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary">
          <ArrowLeft size={14} /> Back
        </Link>
        <p className="mt-6 text-sm text-ink-muted">Run not found or still loading…</p>
      </div>
    )
  }

  const taskIds = Object.keys(run.task_states).sort()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-8 py-5">
        <div className="flex items-center gap-3">
          <Link to={`/ui/dags/${run.dag_id}`} className="text-ink-muted hover:text-ink-secondary">
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold tracking-tight">{run.dag_id}</h1>
              <StateBadge state={run.state} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{run.run_id}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-6 text-xs text-ink-muted">
          {run.start_time && <span>Started {relativeTime(run.start_time)}</span>}
          {run.duration_seconds != null && <span>Duration {formatDuration(run.duration_seconds)}</span>}
          <span>{taskIds.length} tasks</span>
        </div>
        {run.error && (
          <pre className="mt-3 rounded-md bg-error-muted px-3 py-2 text-xs text-error">{run.error}</pre>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Task sidebar */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border bg-bg-raised">
          <div className="px-3 py-3">
            <button
              onClick={() => setSelectedTask(null)}
              className={cn(
                'w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                selectedTask === null
                  ? 'bg-bg-surface text-ink'
                  : 'text-ink-secondary hover:bg-bg-hover',
              )}
            >
              All tasks
            </button>
          </div>
          <div className="space-y-0.5 px-3 pb-3">
            {taskIds.map((tid) => (
              <button
                key={tid}
                onClick={() => setSelectedTask(tid)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                  selectedTask === tid
                    ? 'bg-bg-surface text-ink'
                    : 'text-ink-secondary hover:bg-bg-hover',
                )}
              >
                <span className="truncate">{tid}</span>
                <StateBadge state={run.task_states[tid]} />
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
