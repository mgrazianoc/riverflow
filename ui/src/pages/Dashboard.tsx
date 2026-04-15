import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ArrowRight, Box, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { relativeTime, formatDuration, formatRate } from '../lib/utils'
import type { DAGSummary, DAGRun } from '../types'

export function Dashboard() {
  const { data: dags = [] } = useQuery({ queryKey: ['dags'], queryFn: api.getDags, refetchInterval: 5000 })
  const { data: runs = [] } = useQuery({ queryKey: ['history'], queryFn: () => api.getHistory(30), refetchInterval: 5000 })

  const runningCount = dags.filter((d) => d.is_running).length
  const totalRuns = dags.reduce((a, d) => a + d.total_runs, 0)
  const failedRecent = runs.filter((r) => r.state === 'failed').length

  return (
    <div className="px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-secondary">System overview</p>

      {/* KPI strip */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <KPI label="DAGs" value={dags.length} icon={<Box size={14} />} />
        <KPI label="Running" value={runningCount} icon={<Loader2 size={14} className={runningCount ? 'animate-spin' : ''} />} />
        <KPI label="Total runs" value={totalRuns} icon={<CheckCircle2 size={14} />} />
        <KPI label="Recent failures" value={failedRecent} icon={<XCircle size={14} />} accent={failedRecent > 0 ? 'text-error' : undefined} />
      </div>

      <div className="mt-8 grid grid-cols-5 gap-8">
        {/* DAG list — takes 3 cols */}
        <section className="col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-secondary">DAGs</h2>
            <Link to="/ui/dags" className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink-secondary">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {dags.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No DAGs registered</p>
            )}
            {dags.map((d) => (
              <DAGRow key={d.dag_id} dag={d} />
            ))}
          </div>
        </section>

        {/* Activity feed — takes 2 cols */}
        <section className="col-span-2">
          <h2 className="text-sm font-medium text-ink-secondary">Recent activity</h2>
          <div className="mt-3 space-y-1">
            {runs.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-muted">No runs yet</p>
            )}
            {runs.slice(0, 15).map((r) => (
              <RunRow key={r.run_id} run={r} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function KPI({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-raised px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${accent ?? ''}`}>
        {value}
      </div>
    </div>
  )
}

function DAGRow({ dag }: { dag: DAGSummary }) {
  return (
    <Link
      to={`/ui/dags/${dag.dag_id}`}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bg-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{dag.dag_id}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-muted">
          <span>{dag.total_runs} runs</span>
          {dag.total_runs > 0 && <span>{formatRate(dag.success_rate)}</span>}
          {dag.avg_duration_seconds > 0 && <span>avg {formatDuration(dag.avg_duration_seconds)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {dag.schedule_display && (
          <span className="text-xs text-ink-muted">{dag.schedule_display}</span>
        )}
        <StateBadge state={dag.is_running ? 'running' : 'idle'} />
      </div>
    </Link>
  )
}

function RunRow({ run }: { run: DAGRun }) {
  return (
    <Link
      to={`/ui/runs/${run.run_id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-bg-hover"
    >
      <StateBadge state={run.state} />
      <span className="min-w-0 flex-1 truncate text-sm">{run.dag_id}</span>
      {run.duration_seconds != null && (
        <span className="text-xs tabular-nums text-ink-muted">{formatDuration(run.duration_seconds)}</span>
      )}
      <time className="text-xs tabular-nums text-ink-muted">{relativeTime(run.start_time)}</time>
    </Link>
  )
}
