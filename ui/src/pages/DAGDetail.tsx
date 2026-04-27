import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, NavLink, Outlet } from 'react-router'
import { useMemo, useState } from 'react'
import { Play } from '../components/icons'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { RelativeTime } from '../components/RelativeTime'
import { SkeletonRows } from '../components/Skeleton'
import { ErrorState, EmptyState } from '../components/QueryState'
import { TriggerRunDialog } from '../components/TriggerRunDialog'
import { useToast } from '../hooks/useToast'
import { formatRate, formatDuration, cn, errorMessage } from '../lib/utils'
import { useShortcut } from '../hooks/useShortcut'
import { useUrlState } from '../hooks/useUrlState'
import type { DAGRunState, TriggerRunRequest } from '../types'

const tabs = [
  { to: '', label: 'Overview', end: true },
  { to: 'graph', label: 'Graph', end: true },
  { to: 'grid', label: 'Grid', end: true },
  { to: 'gantt', label: 'Gantt', end: true },
  { to: 'history', label: 'History', end: true },
  { to: 'tasks', label: 'Tasks', end: true },
]

export function DAGDetail() {
  const { dagId } = useParams<{ dagId: string }>()
  const qc = useQueryClient()
  const toast = useToast()
  const [triggerOpen, setTriggerOpen] = useState(false)
  const dagQ = useQuery({
    queryKey: ['dag', dagId],
    queryFn: () => api.getDag(dagId!),
    enabled: !!dagId,
    refetchInterval: 5000,
  })
  const dag = dagQ.data

  const trigger = useMutation({
    mutationFn: (payload?: TriggerRunRequest) => api.triggerDag(dagId!, payload),
    onSuccess: (run) => {
      toast.push(`Triggered ${run.dag_id}`, 'success')
      setTriggerOpen(false)
      qc.invalidateQueries({ queryKey: ['dag', dagId] })
      qc.invalidateQueries({ queryKey: ['history'] })
    },
    onError: (err) => toast.push(errorMessage(err), 'error'),
  })

  const clearHistory = useMutation({
    mutationFn: () => api.clearHistory(dagId!),
    onSuccess: (res) => {
      toast.push(`Cleared ${res.cleared} run${res.cleared === 1 ? '' : 's'}`, 'success')
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['dag', dagId] })
      qc.invalidateQueries({ queryKey: ['dags'] })
    },
    onError: (err) => toast.push(errorMessage(err), 'error'),
  })

  useShortcut('t', () => {
    if (!trigger.isPending && dag) setTriggerOpen(true)
  }, { enabled: !!dag })

  if (dagQ.isLoading) {
    return <div className="px-10 py-10"><SkeletonRows rows={5} columns={3} /></div>
  }
  if (dagQ.isError) {
    return <ErrorState error={dagQ.error} onRetry={() => dagQ.refetch()} />
  }
  if (!dag) return null

  const handleClearHistory = () => {
    if (!window.confirm(`Clear all run history for "${dag.dag_id}"?`)) return
    clearHistory.mutate()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto max-w-7xl px-8 pt-8">
          {/* Masthead row */}
          <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            <Link to="/ui/dags" className="transition-colors hover:text-ink">
              ← Pipelines
            </Link>
            <span>DAG</span>
          </div>

          {/* Title row — editorial */}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[34px] font-light leading-[1.05] tracking-[-0.015em] text-ink">
                {dag.dag_id}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <StateBadge state={dag.is_running ? 'running' : 'idle'} />
                {dag.description && (
                  <p className="line-clamp-1 max-w-2xl text-sm text-ink-secondary">{dag.description}</p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <button
                onClick={handleClearHistory}
                disabled={clearHistory.isPending || dag.total_runs === 0}
                className="text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                Clear history
              </button>
              <button
                onClick={() => setTriggerOpen(true)}
                disabled={trigger.isPending}
                title="Trigger (t)"
                className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[12px] font-medium text-bg transition-colors hover:bg-accent hover:border-accent disabled:opacity-50"
              >
                <Play size={11} />
                Trigger
                <kbd className="ml-1 hidden rounded-sm border border-bg/30 px-1 font-mono text-[9px] sm:inline">t</kbd>
              </button>
            </div>
          </div>

          {/* Stats row — editorial rhythm, mono numerals */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px] text-ink-muted">
            <Stat label="tasks" value={String(dag.tasks.length)} />
            <Stat label="runs" value={String(dag.total_runs)} />
            {dag.total_runs > 0 && (
              <Stat label="success" value={formatRate(dag.success_rate)} />
            )}
            {dag.avg_duration_seconds > 0 && (
              <Stat label="avg" value={formatDuration(dag.avg_duration_seconds)} />
            )}
            {dag.schedule_display && (
              <Stat label="schedule" value={dag.schedule_display} />
            )}
            {dag.next_run && (
              <span>
                <span className="text-ink-muted">next </span>
                <RelativeTime iso={dag.next_run} className="text-ink-secondary" />
              </span>
            )}
          </div>

          {/* Tabs */}
          <nav className="mt-6 flex gap-6">
            {tabs.map(({ to, label, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    '-mb-px border-b px-0 pb-2.5 text-[13px] transition-colors',
                    isActive
                      ? 'border-ink text-ink'
                      : 'border-transparent text-ink-muted hover:text-ink-secondary',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>

      <TriggerRunDialog
        dagId={dag.dag_id}
        open={triggerOpen}
        pending={trigger.isPending}
        onClose={() => setTriggerOpen(false)}
        onSubmit={(payload) => trigger.mutate(payload)}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-ink-secondary tabular-nums">{value}</span>{' '}
      <span className="uppercase tracking-widest">{label}</span>
    </span>
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
  const runsQ = useQuery({
    queryKey: ['history', dagId],
    queryFn: () => api.getHistory(10, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })
  const runs = runsQ.data ?? []

  if (!dag) return null

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-3 gap-10 px-8 py-10">
      {/* Recent runs */}
      <section className="col-span-2">
        <h3 className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">Recent runs</h3>
        {runsQ.isLoading ? (
          <SkeletonRows rows={4} columns={3} />
        ) : runsQ.isError ? (
          <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} className="py-4" />
        ) : runs.length === 0 ? (
          <EmptyState title="No runs yet" hint="Press t to trigger this DAG." className="py-8" />
        ) : (
          <div className="divide-y divide-border">
            {runs.map((r) => (
              <Link
                key={r.run_id}
                to={`/ui/runs/${r.run_id}`}
                className="group flex items-center gap-4 py-2 transition-colors hover:bg-bg-raised/50"
              >
                <StateBadge state={r.state} compact />
                <span className="flex-1 truncate font-mono text-[11px] text-ink-secondary group-hover:text-accent">
                  {r.run_id}
                </span>
                <span className="w-20 text-right text-xs tabular-nums text-ink-muted">
                  {r.duration_seconds != null ? formatDuration(r.duration_seconds) : '—'}
                </span>
                <span className="w-28 truncate text-right font-mono text-[10px] text-ink-muted">
                  {r.trigger_source ?? 'manual'}{r.trigger_mode ? `/${r.trigger_mode}` : ''}
                </span>
                <RelativeTime iso={r.start_time} className="w-20 text-right text-xs tabular-nums text-ink-muted" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Details */}
      <section>
        <h3 className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">Details</h3>
        <dl className="space-y-2.5 text-sm">
          <InfoRow label="Timezone" value={dag.timezone} />
          <InfoRow label="Tasks" value={String(dag.tasks.length)} />
          <InfoRow label="Schedule" value={dag.schedule_display ?? 'Manual'} />
          <InfoRow label="Success" value={dag.total_runs > 0 ? formatRate(dag.success_rate) : '—'} />
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
    <div className="flex justify-between gap-2 border-b border-border/40 pb-2 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate text-right">
        {link ? (
          <Link to={link} className="font-mono text-[11px] text-accent hover:underline">{value}</Link>
        ) : (
          <span className="text-ink">{value}</span>
        )}
      </dd>
    </div>
  )
}

/* ─── Tab: History ───────────────────────────────────── */

const STATE_FILTERS: { label: string; value: DAGRunState | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
]

export function DAGHistory() {
  const { dagId } = useParams<{ dagId: string }>()
  const runsQ = useQuery({
    queryKey: ['history', dagId, 'full'],
    queryFn: () => api.getHistory(100, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  const [stateFilter, setStateFilter] = useUrlState<DAGRunState | 'all'>(
    'state',
    'all',
    (raw) => (['running', 'success', 'failed'].includes(raw) ? (raw as DAGRunState) : 'all'),
    (v) => (v === 'all' ? null : v),
  )
  const [search, setSearch] = useUrlState<string>('q', '')

  const filtered = useMemo(() => {
    let r = runsQ.data ?? []
    if (stateFilter !== 'all') r = r.filter((run) => run.state === stateFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter((run) => {
        const haystack = [
          run.run_id,
          run.trigger_source,
          run.trigger_mode,
          run.requested_by,
          JSON.stringify(run.metadata ?? {}),
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    return r
  }, [runsQ.data, stateFilter, search])

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <div className="mb-4 flex items-center gap-5 border-b border-border pb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search run ID…"
          className="w-64 border-0 bg-transparent py-1 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <div className="flex gap-4 font-mono text-[10px] uppercase tracking-[0.14em]">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStateFilter(f.value)}
              className={cn(
                'transition-colors',
                stateFilter === f.value ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          {runsQ.data ? `${filtered.length} / ${runsQ.data.length}` : ''}
        </span>
      </div>

      {runsQ.isLoading ? (
        <SkeletonRows rows={8} columns={5} />
      ) : runsQ.isError ? (
        <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} className="py-12" />
      ) : (runsQ.data?.length ?? 0) === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">No runs recorded.</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">No matches.</p>
      ) : (
        <table className="w-full text-left">
          <colgroup>
            <col className="w-27.5" />
            <col />
            <col className="w-30" />
            <col className="w-36" />
            <col className="w-25" />
            <col className="w-17.5" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              <th className="py-2.5">Status</th>
              <th className="py-2.5">Run ID</th>
              <th className="py-2.5">Started</th>
              <th className="py-2.5">Trigger</th>
              <th className="py-2.5 text-right">Duration</th>
              <th className="py-2.5 text-right">Tasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.map((r) => {
              const reason = r.state === 'failed' ? extractFailureReason(r.error) : null
              return (
                <tr key={r.run_id} className="group">
                  <td className="py-2.5 align-top"><StateBadge state={r.state} /></td>
                  <td className="py-2.5 align-top">
                    <Link to={`/ui/runs/${r.run_id}`} className="font-mono text-[11px] text-ink-secondary hover:text-accent">
                      {r.run_id}
                    </Link>
                    {reason && (
                      <div
                        className="mt-0.5 max-w-xl truncate font-mono text-[10px] text-error"
                        title={r.error ?? undefined}
                      >
                        {reason}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 align-top font-mono text-[11px] text-ink-muted"><RelativeTime iso={r.start_time} /></td>
                  <td className="py-2.5 align-top">
                    <TriggerCell source={r.trigger_source} mode={r.trigger_mode} force={r.force} />
                  </td>
                  <td className="py-2.5 align-top text-right font-mono text-[11px] text-ink-secondary">{formatDuration(r.duration_seconds)}</td>
                  <td className="py-2.5 align-top text-right font-mono text-[11px] text-ink-muted">{Object.keys(r.task_states).length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TriggerCell({ source, mode, force }: { source: string | null; mode: string | null; force: boolean }) {
  return (
    <div className="font-mono text-[10px] leading-4 text-ink-muted">
      <div className="text-ink-secondary">{source ?? 'manual'}</div>
      <div>{mode ?? '—'}{force ? ' · force' : ''}</div>
    </div>
  )
}

/**
 * Extract a compact failure headline from a run's error string.
 * Python tracebacks typically end with "ExceptionClass: message" — that's
 * the most informative single line to surface. Falls back to the first
 * non-empty line if no such pattern is found.
 */
function extractFailureReason(err: string | null): string | null {
  if (!err) return null
  const lines = err.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  // Walk backwards — the last "Class: msg" line is the real cause.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^([A-Z][A-Za-z0-9_.]*(?:Error|Exception|Warning|Fault)):\s*(.*)$/)
    if (m) {
      const label = m[1]
      const msg = m[2].trim()
      return msg ? `${label}: ${msg}` : label
    }
  }
  return lines[lines.length - 1]
}

/* ─── Tab: Tasks ─────────────────────────────────────── */

export function DAGTasks() {
  const { dagId } = useParams<{ dagId: string }>()
  const dagQ = useQuery({
    queryKey: ['dag', dagId],
    queryFn: () => api.getDag(dagId!),
    enabled: !!dagId,
  })

  if (dagQ.isLoading) return <div className="mx-auto max-w-7xl px-8 py-10"><SkeletonRows rows={5} columns={5} /></div>
  if (dagQ.isError) return <ErrorState error={dagQ.error} onRetry={() => dagQ.refetch()} />
  const dag = dagQ.data
  if (!dag) return null

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            <th className="py-2.5">Task</th>
            <th className="py-2.5">Trigger rule</th>
            <th className="py-2.5 text-right">Retries</th>
            <th className="py-2.5 text-right">Timeout</th>
            <th className="py-2.5">Dependencies</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {dag.tasks.map((t) => (
            <tr key={t.task_id}>
              <td className="py-2.5 text-[13px] text-ink">{t.task_id}</td>
              <td className="py-2.5 font-mono text-[11px] text-ink-secondary">{t.trigger_rule}</td>
              <td className="py-2.5 text-right font-mono text-[11px] text-ink-secondary">{t.retries}</td>
              <td className="py-2.5 text-right font-mono text-[11px] text-ink-secondary">
                {t.timeout_seconds != null ? formatDuration(t.timeout_seconds) : '—'}
              </td>
              <td className="py-2.5 font-mono text-[11px] text-ink-muted">
                {t.upstream_task_ids.length > 0 ? t.upstream_task_ids.join(', ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

