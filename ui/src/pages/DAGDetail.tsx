import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, NavLink, Outlet } from 'react-router'
import { Play, ArrowLeft, Clock, BarChart3, Network, List, Grid3X3, GanttChart } from 'lucide-react'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { formatRate, formatDuration, relativeTime, cn } from '../lib/utils'

const tabs = [
  { to: '', label: 'Overview', icon: BarChart3, end: true },
  { to: 'graph', label: 'Graph', icon: Network, end: true },
  { to: 'grid', label: 'Grid', icon: Grid3X3, end: true },
  { to: 'gantt', label: 'Gantt', icon: GanttChart, end: true },
  { to: 'history', label: 'History', icon: Clock, end: true },
  { to: 'tasks', label: 'Tasks', icon: List, end: true },
]

export function DAGDetail() {
  const { dagId } = useParams<{ dagId: string }>()
  const qc = useQueryClient()
  const { data: dag } = useQuery({
    queryKey: ['dag', dagId],
    queryFn: () => api.getDag(dagId!),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  const trigger = useMutation({
    mutationFn: () => api.triggerDag(dagId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dag', dagId] })
      qc.invalidateQueries({ queryKey: ['history'] })
    },
  })

  if (!dag) return <div className="px-8 py-8 text-sm text-ink-muted">Loading…</div>

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-8 pb-0 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/ui/dags" className="text-ink-muted hover:text-ink-secondary">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{dag.dag_id}</h1>
          <StateBadge state={dag.is_running ? 'running' : 'idle'} />
          <div className="flex-1" />
          <button
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Play size={12} />
            Trigger
          </button>
        </div>
        {dag.description && (
          <p className="mt-1.5 text-sm text-ink-secondary">{dag.description}</p>
        )}

        {/* Stats row */}
        <div className="mt-4 flex items-center gap-6 text-xs text-ink-muted">
          <span>{dag.total_runs} runs</span>
          {dag.total_runs > 0 && (
            <>
              <span>{formatRate(dag.success_rate)} success</span>
              {dag.avg_duration_seconds > 0 && <span>avg {formatDuration(dag.avg_duration_seconds)}</span>}
            </>
          )}
          {dag.schedule_display && <span>{dag.schedule_display}</span>}
          {dag.next_run && <span>next {relativeTime(dag.next_run)}</span>}
          <span>{dag.tasks.length} tasks</span>
        </div>

        {/* Tab nav */}
        <nav className="mt-4 flex gap-0">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink-secondary',
                )
              }
            >
              <Icon size={13} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}

/* ─── Tab: Overview ──────────────────────────────────── */

export function DAGOverview() {
  const { dagId } = useParams<{ dagId: string }>()
  const { data: dag } = useQuery({
    queryKey: ['dag', dagId],
    queryFn: () => api.getDag(dagId!),
    enabled: !!dagId,
    refetchInterval: 5000,
  })
  const { data: runs = [] } = useQuery({
    queryKey: ['history', dagId],
    queryFn: () => api.getHistory(10, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  if (!dag) return null

  return (
    <div className="grid grid-cols-3 gap-8 px-8 py-6">
      {/* Recent runs */}
      <section className="col-span-2">
        <h3 className="text-sm font-medium text-ink-secondary">Recent runs</h3>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {runs.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">No runs yet</p>
          )}
          {runs.map((r) => (
            <Link
              key={r.run_id}
              to={`/ui/runs/${r.run_id}`}
              className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-bg-hover"
            >
              <StateBadge state={r.state} />
              <span className="flex-1 truncate text-xs font-mono text-ink-secondary">{r.run_id}</span>
              {r.duration_seconds != null && (
                <span className="text-xs tabular-nums text-ink-muted">{formatDuration(r.duration_seconds)}</span>
              )}
              <time className="text-xs tabular-nums text-ink-muted">{relativeTime(r.start_time)}</time>
            </Link>
          ))}
        </div>
      </section>

      {/* Info panel */}
      <section>
        <h3 className="text-sm font-medium text-ink-secondary">Details</h3>
        <dl className="mt-3 space-y-3 text-sm">
          <InfoRow label="Timezone" value={dag.timezone} />
          <InfoRow label="Tasks" value={String(dag.tasks.length)} />
          <InfoRow label="Schedule" value={dag.schedule_display ?? 'Manual'} />
          <InfoRow label="Success rate" value={dag.total_runs > 0 ? formatRate(dag.success_rate) : '—'} />
          <InfoRow label="Avg duration" value={dag.avg_duration_seconds > 0 ? formatDuration(dag.avg_duration_seconds) : '—'} />
          {dag.latest_run_id && (
            <InfoRow label="Latest run" value={dag.latest_run_id} link={`/ui/runs/${dag.latest_run_id}`} />
          )}
        </dl>
      </section>
    </div>
  )
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">
        {link ? (
          <Link to={link} className="font-mono text-xs text-accent hover:underline">{value}</Link>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

/* ─── Tab: History ───────────────────────────────────── */

export function DAGHistory() {
  const { dagId } = useParams<{ dagId: string }>()
  const { data: runs = [] } = useQuery({
    queryKey: ['history', dagId, 'full'],
    queryFn: () => api.getHistory(100, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  return (
    <div className="px-8 py-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-ink-muted">
            <th className="pb-2.5 font-medium">Status</th>
            <th className="pb-2.5 font-medium">Run ID</th>
            <th className="pb-2.5 font-medium">Started</th>
            <th className="pb-2.5 font-medium text-right">Duration</th>
            <th className="pb-2.5 font-medium text-right">Tasks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((r) => (
            <tr key={r.run_id} className="transition-colors hover:bg-bg-hover">
              <td className="py-2.5">
                <StateBadge state={r.state} />
              </td>
              <td className="py-2.5">
                <Link to={`/ui/runs/${r.run_id}`} className="font-mono text-xs text-accent hover:underline">
                  {r.run_id}
                </Link>
              </td>
              <td className="py-2.5 text-xs text-ink-secondary">{relativeTime(r.start_time)}</td>
              <td className="py-2.5 text-right text-xs tabular-nums text-ink-secondary">
                {formatDuration(r.duration_seconds)}
              </td>
              <td className="py-2.5 text-right text-xs tabular-nums text-ink-muted">
                {Object.keys(r.task_states).length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 && (
        <p className="py-16 text-center text-sm text-ink-muted">No runs recorded</p>
      )}
    </div>
  )
}

/* ─── Tab: Tasks ─────────────────────────────────────── */

export function DAGTasks() {
  const { dagId } = useParams<{ dagId: string }>()
  const { data: dag } = useQuery({
    queryKey: ['dag', dagId],
    queryFn: () => api.getDag(dagId!),
    enabled: !!dagId,
  })

  if (!dag) return null

  return (
    <div className="px-8 py-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-ink-muted">
            <th className="pb-2.5 font-medium">Task</th>
            <th className="pb-2.5 font-medium">Trigger rule</th>
            <th className="pb-2.5 font-medium text-right">Retries</th>
            <th className="pb-2.5 font-medium text-right">Timeout</th>
            <th className="pb-2.5 font-medium">Dependencies</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {dag.tasks.map((t) => (
            <tr key={t.task_id} className="transition-colors hover:bg-bg-hover">
              <td className="py-2.5 font-medium">{t.task_id}</td>
              <td className="py-2.5 text-ink-secondary">{t.trigger_rule}</td>
              <td className="py-2.5 text-right tabular-nums text-ink-secondary">{t.retries}</td>
              <td className="py-2.5 text-right tabular-nums text-ink-secondary">
                {t.timeout_seconds != null ? formatDuration(t.timeout_seconds) : '—'}
              </td>
              <td className="py-2.5 text-ink-muted">
                {t.upstream_task_ids.length > 0 ? t.upstream_task_ids.join(', ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
