import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useMemo } from 'react'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { RelativeTime } from '../components/RelativeTime'
import { RunStrip } from '../components/RunStrip'
import { Sparkline } from '../components/Sparkline'
import { ActivityChart } from '../components/ActivityChart'
import { SkeletonRows } from '../components/Skeleton'
import { ErrorState } from '../components/QueryState'
import { usePrefetchDag } from '../hooks/usePrefetchDag'
import { formatDuration, formatRate, cn } from '../lib/utils'
import type { DAGRun, DAGSummary } from '../types'

/**
 * Broadsheet Dashboard.
 * Editorial headline → operational pipeline/run index → compact activity trend.
 */
export function Dashboard() {
  const dagsQ = useQuery({ queryKey: ['dags'], queryFn: api.getDags, refetchInterval: 5000 })
  const runsQ = useQuery({ queryKey: ['history'], queryFn: () => api.getHistory(500), refetchInterval: 5000 })

  const dags = useMemo<DAGSummary[]>(() => dagsQ.data ?? [], [dagsQ.data])
  const runs = useMemo<DAGRun[]>(() => runsQ.data ?? [], [runsQ.data])

  const runsByDag = useMemo(() => {
    const m = new Map<string, DAGRun[]>()
    for (const r of runs) {
      const arr = m.get(r.dag_id) ?? []
      arr.push(r)
      m.set(r.dag_id, arr)
    }
    return m
  }, [runs])

  const runningDags = useMemo(() => dags.filter((d) => d.is_running), [dags])
  const last24h = useMemo(() => {
    const anchor = runsQ.dataUpdatedAt || 0
    if (!anchor) return []
    const cutoff = anchor - 24 * 3600 * 1000
    return runs.filter((r) => {
      if (!r.start_time) return false
      return new Date(r.start_time).getTime() >= cutoff
    })
  }, [runs, runsQ.dataUpdatedAt])
  const recentFailures = last24h.filter((r) => r.state === 'failed').length
  const latestRun = runs[0]
  const loading = dagsQ.isLoading || runsQ.isLoading

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-7 pb-12 sm:px-6 sm:pt-10 sm:pb-14 lg:px-8">
      {/* Masthead date — editorial cue */}
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          Overview
        </span>
      </div>

      {/* Hairline rule */}
      <div className="border-t border-ink" />

      {/* Headline — editorial, data-first, display serif */}
      <div className="pt-5 pb-6 sm:pt-6 sm:pb-7">
        <Headline
          loading={loading}
          dagCount={dags.length}
          runningCount={runningDags.length}
          recentFailures={recentFailures}
          totalLast24h={last24h.length}
          latestRun={latestRun}
        />
      </div>

      <div className="grid items-start gap-9 xl:grid-cols-[minmax(0,2fr)_minmax(340px,0.9fr)] xl:gap-x-10">
        {/* Pipelines — primary navigation and current health */}
        <section className="min-w-0 border-t border-border pt-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
              Pipelines
            </h2>
            <Link to="/ui/dags" className="text-xs text-ink-muted transition-colors hover:text-ink">
              {dags.length > 0 ? `${dags.length} registered · view all →` : ''}
            </Link>
          </div>
          {dagsQ.isLoading ? (
            <SkeletonRows rows={4} columns={5} />
          ) : dagsQ.isError ? (
            <ErrorState error={dagsQ.error} onRetry={() => dagsQ.refetch()} className="py-10" />
          ) : dags.length === 0 ? (
            <EmptyDags />
          ) : (
            <div>
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                    <th className="py-2.5">Name</th>
                    <th className="w-30 py-2.5">Last 20</th>
                    <th className="hidden w-32 py-2.5 lg:table-cell">Duration</th>
                    <th className="hidden w-25 py-2.5 text-right sm:table-cell">Runs</th>
                    <th className="hidden w-22 py-2.5 text-right md:table-cell">Avg</th>
                    <th className="hidden w-34 py-2.5 pl-4 lg:table-cell">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {dags.slice(0, 8).map((d) => (
                    <DAGRow key={d.dag_id} dag={d} runs={runsByDag.get(d.dag_id) ?? []} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent runs — glanceable, not a second full-width log */}
        <section className="min-w-0 border-t border-border pt-5 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
              Recent runs
            </h2>
            <span className="text-xs text-ink-muted">latest 8</span>
          </div>
          {runsQ.isLoading ? (
            <SkeletonRows rows={6} columns={3} />
          ) : runsQ.isError ? (
            <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} className="py-8" />
          ) : runs.length === 0 ? (
            <p className="py-6 text-sm text-ink-muted">No runs yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {runs.slice(0, 8).map((r) => (
                <Link
                  key={r.run_id}
                  to={`/ui/runs/${r.run_id}`}
                  className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5 transition-colors hover:bg-bg-raised/60"
                >
                  <StateBadge state={r.state} compact />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-ink group-hover:text-accent">
                      {r.dag_id}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-muted">
                      {r.run_id}
                    </span>
                  </span>
                  <span className="text-right">
                    <RelativeTime iso={r.start_time} className="block font-mono text-[11px] text-ink-muted" />
                    <span className="block font-mono text-[11px] text-ink-secondary">
                      {r.duration_seconds != null ? formatDuration(r.duration_seconds) : '—'}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Trend is useful context, but secondary to live operational state. */}
        <section className="min-w-0 border-t border-border pt-5 xl:col-start-1">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
              Activity · 14 days
            </h2>
            <span className="text-xs text-ink-muted">
              success · duration · failures
            </span>
          </div>
          {loading ? (
            <div className="h-52 animate-pulse rounded-sm bg-bg-raised/60" />
          ) : runsQ.isError ? (
            <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} className="py-10" />
          ) : (
            <ActivityChart runs={runs} days={14} />
          )}
        </section>
      </div>
    </div>
  )
}

/* ─── Headline ──────────────────────────────────────── */

interface HeadlineProps {
  loading: boolean
  dagCount: number
  runningCount: number
  recentFailures: number
  totalLast24h: number
  latestRun?: DAGRun
}

function Headline({ loading, dagCount, runningCount, recentFailures, totalLast24h, latestRun }: HeadlineProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-3/4 animate-pulse rounded-sm bg-bg-surface/80" />
        <div className="h-4 w-1/3 animate-pulse rounded-sm bg-bg-surface/80" />
      </div>
    )
  }

  if (dagCount === 0) {
    return (
      <h1 className="font-display text-[42px] font-normal leading-[1.05] tracking-[-0.015em] text-ink">
        No pipelines registered yet.
      </h1>
    )
  }

  // Choose the most newsworthy fact as the headline
  const body = (() => {
    if (recentFailures > 0) {
      return (
        <>
          <em className="font-display not-italic text-error">
            {recentFailures}
          </em>
          {' '}
          <span className="text-ink">
            {recentFailures === 1 ? 'failure' : 'failures'} in the last 24 hours
          </span>
          <span className="text-ink-muted"> across {dagCount} {dagCount === 1 ? 'DAG' : 'DAGs'}.</span>
        </>
      )
    }
    if (runningCount > 0) {
      return (
        <>
          <em className="font-display not-italic text-accent">
            {runningCount}
          </em>
          {' '}
          <span className="text-ink">of {dagCount} {dagCount === 1 ? 'pipeline' : 'pipelines'} running</span>
          <span className="text-ink-muted"> right now.</span>
        </>
      )
    }
    return (
      <>
        <em className="font-display not-italic text-success">
          {dagCount === 1 ? dagCount : `All ${dagCount}`}
        </em>
        {' '}
        <span className="text-ink">{dagCount === 1 ? 'pipeline is' : 'pipelines are'} healthy.</span>
      </>
    )
  })()

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.015em] sm:text-[42px]">
        {body}
      </h1>
      <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted">
        {totalLast24h} {totalLast24h === 1 ? 'run' : 'runs'} in last 24h
        {latestRun && (
          <>
            <span className="mx-2">·</span>
            latest{' '}
            <Link to={`/ui/runs/${latestRun.run_id}`} className="normal-case text-ink-secondary transition-colors hover:text-accent">
              {latestRun.dag_id}
            </Link>
            {' '}
            <RelativeTime iso={latestRun.start_time} className="normal-case" />
          </>
        )}
      </p>
    </div>
  )
}

/* ─── DAG row ───────────────────────────────────────── */

function DAGRow({ dag, runs }: { dag: DAGSummary; runs: DAGRun[] }) {
  const prefetch = usePrefetchDag(dag.dag_id)
  return (
    <tr className="group">
      <td className="py-3.5">
        <Link
          to={`/ui/dags/${dag.dag_id}`}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          className="flex items-center gap-2 text-[14px] text-ink transition-colors hover:text-accent"
        >
          {dag.is_running && (
            <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Running" />
          )}
          <span className="truncate">{dag.dag_id}</span>
        </Link>
      </td>
      <td className="py-3.5">
        <RunStrip runs={runs} max={20} />
      </td>
      <td className="hidden py-3.5 lg:table-cell">
        <Sparkline runs={runs} max={20} />
      </td>
      <td className="hidden py-3.5 text-right font-mono text-[12px] tabular-nums sm:table-cell">
        <span className="text-ink">{dag.total_runs}</span>
        {dag.total_runs > 0 && (
          <span className={cn('ml-1.5', successRateClass(dag.success_rate))}>
            {formatRate(dag.success_rate)}
          </span>
        )}
      </td>
      <td className="hidden py-3.5 text-right font-mono text-[12px] text-ink-secondary md:table-cell">
        {dag.avg_duration_seconds > 0 ? formatDuration(dag.avg_duration_seconds) : '—'}
      </td>
      <td className="hidden py-3.5 pl-4 font-mono text-[12px] text-ink-muted lg:table-cell">
        {dag.next_run ? (
          <RelativeTime iso={dag.next_run} />
        ) : dag.schedule_display ? (
          <span>{dag.schedule_display}</span>
        ) : (
          <span>manual</span>
        )}
      </td>
    </tr>
  )
}

function successRateClass(rate: number): string {
  if (rate >= 95) return 'text-ink-muted'
  if (rate >= 80) return 'text-warning'
  return 'text-error'
}

/* ─── Empty state — real code, not decoration ──────── */

function EmptyDags() {
  return (
    <div className="border-l-2 border-ink/80 pl-6">
      <p className="text-sm text-ink-secondary">
        Register a DAG from your Python application:
      </p>
      <pre className="mt-4 overflow-x-auto bg-bg-inset p-5 font-mono text-[13px] leading-[1.7] text-ink-secondary">
{`from riverflow import DAG, serve

with DAG(dag_id="my_pipeline") as dag:
    @dag.task("hello")
    async def hello():
        print("hi")

serve(dag)`}
      </pre>
      <p className="mt-3 font-mono text-[12px] text-ink-muted">
        Refresh this page once the server reloads.
      </p>
    </div>
  )
}
