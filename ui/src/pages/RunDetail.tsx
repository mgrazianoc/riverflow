import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router'
import { api } from '../api'
import { LogViewer } from '../components/LogViewer'
import { StateBadge } from '../components/StatusBadge'
import { useToast } from '../hooks/useToast'
import { useUrlState } from '../hooks/useUrlState'
import { formatDuration, relativeTime, cn } from '../lib/utils'

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const toast = useToast()
  const [selectedTask, setSelectedTask] = useUrlState<string | null>(
    'task',
    null,
    (raw) => raw || null,
    (value) => value,
  )

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
      <div className="mx-auto max-w-[1440px] px-8 pt-10">
        <Link
          to="/ui"
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted transition-colors hover:text-ink"
        >
          ← Back
        </Link>
        <p className="mt-6 font-mono text-[12px] text-ink-muted">Run not found or still loading…</p>
      </div>
    )
  }

  const taskIds = Object.keys(run.task_states).sort()
  const copyRunId = async () => {
    await navigator.clipboard.writeText(run.run_id)
    toast.push('Copied run ID', 'success')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — editorial, matches DAGDetail rhythm */}
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto max-w-[1440px] px-4 pt-4 pb-4 sm:px-6 sm:pt-5 lg:px-8">
          <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
            <Link to={`/ui/dags/${run.dag_id}`} className="transition-colors hover:text-ink">
              ← {run.dag_id}
            </Link>
            <span>Run</span>
          </div>

          <div className="flex items-start gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="truncate font-mono text-[16px] font-medium tracking-tight text-ink sm:text-[20px]">
                  {run.run_id}
                </h1>
                <button
                  type="button"
                  onClick={() => void copyRunId()}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:text-accent"
                >
                  Copy ID
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <StateBadge state={run.state} />
                <span className="font-mono text-[12px] text-ink-muted">
                  {run.start_time && <>started {relativeTime(run.start_time)}</>}
                </span>
                {run.duration_seconds != null && (
                  <span className="font-mono text-[12px] text-ink-muted">
                    <span className="text-ink-secondary">{formatDuration(run.duration_seconds)}</span>
                  </span>
                )}
                <span className="font-mono text-[12px] text-ink-muted">
                  <span className="text-ink-secondary">{taskIds.length}</span> tasks
                </span>
              </div>
            </div>
          </div>

          {run.error && (
            <pre className="mt-4 border-l-2 border-error bg-error-muted px-4 py-2 text-[12px] text-error whitespace-pre-wrap">
              {run.error}
            </pre>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4 sm:gap-5">
            <RunContextItem label="Source" value={run.trigger_source ?? 'manual'} />
            <RunContextItem label="Mode" value={run.trigger_mode ?? '—'} />
            <RunContextItem label="Requested by" value={run.requested_by ?? '—'} />
            <RunContextItem label="Force" value={run.force ? 'yes' : 'no'} />
          </div>
          {Object.keys(run.metadata ?? {}).length > 0 && (
            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                Metadata
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto bg-bg-surface px-3 py-2 font-mono text-[12px] leading-5 text-ink-secondary">
                {JSON.stringify(run.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
        {/* Task sidebar */}
        <aside className="max-h-42 w-full shrink-0 overflow-y-auto border-b border-border bg-bg-raised/60 sm:max-h-none sm:w-60 sm:border-r sm:border-b-0">
          <div className="px-4 pt-3 sm:pt-4">
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted">
              Tasks
            </div>
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className={cn(
                'mt-2 w-full rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors',
                selectedTask === null
                  ? 'bg-bg-surface text-ink'
                  : 'text-ink-secondary hover:bg-bg-hover',
              )}
            >
              All tasks
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-px px-4 pb-3 sm:block sm:space-y-px sm:pb-4">
            {taskIds.map((tid) => (
              <button
                type="button"
                key={tid}
                onClick={() => setSelectedTask(tid)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors',
                  selectedTask === tid
                    ? 'bg-bg-surface text-ink'
                    : 'text-ink-secondary hover:bg-bg-hover',
                )}
              >
                <span className="truncate font-mono text-[12px]">{tid}</span>
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

function RunContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-[12px] text-ink-secondary">{value}</div>
    </div>
  )
}
