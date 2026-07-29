import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'
import { ActivityChart } from '../components/ActivityChart'
import { ErrorState } from '../components/QueryState'
import { RelativeTime } from '../components/RelativeTime'
import { RunStrip } from '../components/RunStrip'
import { SkeletonRows } from '../components/Skeleton'
import { Sparkline } from '../components/Sparkline'
import { StateBadge } from '../components/StatusBadge'
import { cn, formatDuration, formatRate } from '../lib/utils'
import type { DAGRun, FlowRun } from '../types'

export function Dashboard() {
  const flowsQ = useQuery({ queryKey: ['flows'], queryFn: api.getFlows, refetchInterval: 5000 })
  const flowRunsQ = useQuery({
    queryKey: ['flow-history'],
    queryFn: () => api.getFlowHistory(100),
    refetchInterval: 5000,
  })
  const dagsQ = useQuery({ queryKey: ['dags'], queryFn: api.getDags, refetchInterval: 5000 })
  const runsQ = useQuery({
    queryKey: ['history'],
    queryFn: () => api.getHistory(500),
    refetchInterval: 5000,
  })

  const flows = useMemo(() => flowsQ.data ?? [], [flowsQ.data])
  const flowRuns = useMemo(() => flowRunsQ.data ?? [], [flowRunsQ.data])
  const dags = useMemo(() => dagsQ.data ?? [], [dagsQ.data])
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data])
  const loading = flowsQ.isLoading || flowRunsQ.isLoading || dagsQ.isLoading || runsQ.isLoading
  const registeredFlowIds = useMemo(() => new Set(flows.map((flow) => flow.flow_id)), [flows])
  const currentFlowRuns = useMemo(
    () => flowRuns.filter((run) => registeredFlowIds.has(run.flow_id)),
    [flowRuns, registeredFlowIds],
  )
  const latestFlowRuns = useMemo(() => {
    const result = new Map<string, FlowRun>()
    for (const run of currentFlowRuns) if (!result.has(run.flow_id)) result.set(run.flow_id, run)
    return result
  }, [currentFlowRuns])
  const runsByDag = useMemo(() => {
    const result = new Map<string, DAGRun[]>()
    for (const run of runs) result.set(run.dag_id, [...(result.get(run.dag_id) ?? []), run])
    return result
  }, [runs])
  const flowDagIds = useMemo(
    () => new Set(flows.flatMap((flow) => flow.nodes.map((node) => node.dag_id))),
    [flows],
  )

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-7 pb-12 sm:px-6 sm:pt-10 sm:pb-14 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">Overview</span>
      </div>
      <div className="border-t border-ink" />

      <div className="pt-5 pb-7 sm:pt-6">
        <Headline
          loading={loading}
          flowCount={flows.length}
          dagCount={dags.length}
          runningFlows={flows.filter((flow) => flow.is_running).length}
          failedFlows={currentFlowRuns.filter((run) => run.state === 'failed').slice(0, 10).length}
        />
      </div>

      <div className="grid items-start gap-9 xl:grid-cols-[minmax(0,1.75fr)_minmax(330px,0.75fr)] xl:gap-x-10">
        <section className="min-w-0 border-t border-ink pt-4">
          <SectionHeading label="Flows" count={flows.length} to="/ui/flows" />
          {flowsQ.isLoading ? (
            <SkeletonRows rows={4} columns={4} />
          ) : flowsQ.isError ? (
            <ErrorState error={flowsQ.error} onRetry={() => flowsQ.refetch()} className="py-10" />
          ) : flows.length === 0 ? (
            <FlowEmpty hasDags={dags.length > 0} />
          ) : (
            <div className="divide-y divide-border/60">
              {flows.slice(0, 7).map((flow) => {
                const latest = latestFlowRuns.get(flow.flow_id)
                const complete = latest
                  ? Object.values(latest.node_states).filter((state) => state === 'success').length
                  : 0
                return (
                  <Link
                    key={flow.flow_id}
                    to={`/ui/flows/${flow.flow_id}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 py-3.5 transition-colors hover:bg-bg-raised/50 sm:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.2fr)_auto]"
                  >
                    <div className="min-w-0">
                      <span className="flex items-center gap-2">
                        <StateBadge state={flow.is_running ? 'running' : latest?.state ?? 'idle'} compact />
                        <span className="truncate text-[15px] font-medium text-ink group-hover:text-accent">{flow.flow_id}</span>
                      </span>
                      {flow.description && (
                        <span className="mt-0.5 block truncate pl-3.5 text-[12px] text-ink-muted">{flow.description}</span>
                      )}
                    </div>
                    <div className="col-span-2 flex min-w-0 items-center gap-2 overflow-hidden pl-3.5 sm:col-span-1 sm:pl-0">
                      {flow.nodes.slice(0, 4).map((node, index) => (
                        <span key={node.node_id} className="contents">
                          {index > 0 && <span className="shrink-0 text-border-bright">→</span>}
                          <span className="truncate font-mono text-[10px] text-ink-secondary" title={node.dag_id}>
                            {node.dag_id}
                          </span>
                        </span>
                      ))}
                      {flow.nodes.length > 4 && <span className="shrink-0 font-mono text-[10px] text-ink-muted">+{flow.nodes.length - 4}</span>}
                    </div>
                    <div className="row-start-1 text-right sm:col-start-3">
                      <span className="block font-mono text-[11px] text-ink-secondary">
                        {latest ? `${complete}/${flow.nodes.length} DAGs` : `${flow.nodes.length} DAGs`}
                      </span>
                      <span className="block font-mono text-[10px] text-ink-muted">
                        {latest ? <RelativeTime iso={latest.start_time} /> : flow.schedule_display ?? 'manual'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 border-t border-border pt-4 xl:col-start-2 xl:row-span-3 xl:row-start-1">
          <SectionHeading label="Recent activity" count={Math.min(10, currentFlowRuns.length + runs.length)} />
          {loading ? (
            <SkeletonRows rows={8} columns={3} />
          ) : flowRunsQ.isError || runsQ.isError ? (
            <ErrorState
              error={flowRunsQ.error ?? runsQ.error}
              onRetry={() => { flowRunsQ.refetch(); runsQ.refetch() }}
              className="py-8"
            />
          ) : (
            <RecentActivity flowRuns={currentFlowRuns} dagRuns={runs} />
          )}
        </section>

        <section className="min-w-0 border-t border-border pt-4">
          <SectionHeading label="DAG library" count={dags.length} to="/ui/dags" />
          {dagsQ.isLoading ? (
            <SkeletonRows rows={4} columns={5} />
          ) : dagsQ.isError ? (
            <ErrorState error={dagsQ.error} onRetry={() => dagsQ.refetch()} className="py-10" />
          ) : dags.length === 0 ? (
            <p className="py-8 text-[13px] text-ink-muted">No DAGs registered.</p>
          ) : (
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  <th className="py-2.5">DAG</th>
                  <th className="hidden w-30 py-2.5 sm:table-cell">Last 20</th>
                  <th className="hidden w-32 py-2.5 lg:table-cell">Duration</th>
                  <th className="w-25 py-2.5 text-right">Runs</th>
                  <th className="hidden w-28 py-2.5 text-right md:table-cell">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {dags.slice(0, 7).map((dag) => (
                  <tr key={dag.dag_id} className="group">
                    <td className="py-3">
                      <Link to={`/ui/dags/${dag.dag_id}`} className="flex items-center gap-2 truncate text-[14px] text-ink hover:text-accent">
                        {dag.is_running && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                        {dag.dag_id}
                      </Link>
                    </td>
                    <td className="hidden py-3 sm:table-cell"><RunStrip runs={runsByDag.get(dag.dag_id) ?? []} max={20} /></td>
                    <td className="hidden py-3 lg:table-cell"><Sparkline runs={runsByDag.get(dag.dag_id) ?? []} max={20} /></td>
                    <td className="py-3 text-right font-mono text-[11px] text-ink-secondary">
                      {dag.total_runs}
                      {dag.total_runs > 0 && <span className={cn('ml-1.5', dag.success_rate < 80 ? 'text-error' : 'text-ink-muted')}>{formatRate(dag.success_rate)}</span>}
                    </td>
                    <td className="hidden py-3 text-right font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted md:table-cell">
                      {flowDagIds.has(dag.dag_id) ? 'Flow node' : 'Standalone'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="min-w-0 border-t border-border pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">DAG activity · 14 days</h2>
            <span className="text-[11px] text-ink-muted">success · duration · failures</span>
          </div>
          {runsQ.isLoading ? (
            <div className="h-44 animate-pulse rounded-sm bg-bg-raised/60" />
          ) : (
            <ActivityChart runs={runs} days={14} />
          )}
        </section>
      </div>
    </div>
  )
}

function Headline({
  loading, flowCount, dagCount, runningFlows, failedFlows,
}: {
  loading: boolean
  flowCount: number
  dagCount: number
  runningFlows: number
  failedFlows: number
}) {
  if (loading) return <div className="h-11 w-3/4 animate-pulse rounded-sm bg-bg-surface/80" />
  if (flowCount === 0 && dagCount === 0) {
    return <h1 className="font-display text-[36px] leading-[1.05] sm:text-[42px]">No workflows registered yet.</h1>
  }
  if (failedFlows > 0) {
    return (
      <h1 className="font-display text-[36px] leading-[1.05] sm:text-[42px]">
        <em className="not-italic text-error">{failedFlows}</em>{' '}
        recent {failedFlows === 1 ? 'Flow needs' : 'Flows need'} attention.
      </h1>
    )
  }
  if (runningFlows > 0) {
    return (
      <h1 className="font-display text-[36px] leading-[1.05] sm:text-[42px]">
        <em className="not-italic text-accent">{runningFlows}</em>{' '}
        {runningFlows === 1 ? 'Flow is' : 'Flows are'} running now.
      </h1>
    )
  }
  return (
    <div>
      <h1 className="font-display text-[36px] leading-[1.05] sm:text-[42px]">
        <em className="not-italic text-success">{flowCount || dagCount}</em>{' '}
        {flowCount > 0 ? `${flowCount === 1 ? 'Flow' : 'Flows'} ready.` : `${dagCount === 1 ? 'DAG' : 'DAGs'} ready.`}
      </h1>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
        {dagCount} reusable {dagCount === 1 ? 'DAG' : 'DAGs'} registered
      </p>
    </div>
  )
}

function SectionHeading({ label, count, to }: { label: string; count: number; to?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">{label}</h2>
      {to ? (
        <Link to={to} className="text-[11px] text-ink-muted hover:text-accent">{count} · view all →</Link>
      ) : (
        <span className="font-mono text-[10px] text-ink-muted">{count}</span>
      )}
    </div>
  )
}

function RecentActivity({ flowRuns, dagRuns }: { flowRuns: FlowRun[]; dagRuns: DAGRun[] }) {
  const items = [
    ...flowRuns.map((run) => ({ kind: 'Flow' as const, time: run.start_time, run })),
    ...dagRuns.map((run) => ({ kind: 'DAG' as const, time: run.start_time, run })),
  ]
    .sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime())
    .slice(0, 10)

  if (items.length === 0) return <p className="py-6 text-[13px] text-ink-muted">No runs yet.</p>
  return (
    <div className="divide-y divide-border/60">
      {items.map(({ kind, run }) => {
        const id = kind === 'Flow' ? (run as FlowRun).flow_id : (run as DAGRun).dag_id
        const to = kind === 'Flow'
          ? `/ui/flows/${id}/runs/${run.run_id}`
          : `/ui/runs/${run.run_id}`
        return (
          <Link key={`${kind}:${run.run_id}`} to={to} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
            <StateBadge state={run.state} compact />
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-[14px] text-ink group-hover:text-accent">{id}</span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-muted">{kind}</span>
              </span>
              <span className="block truncate font-mono text-[10px] text-ink-muted">{run.run_id}</span>
            </span>
            <span className="text-right">
              <RelativeTime iso={run.start_time} className="block font-mono text-[10px] text-ink-muted" />
              <span className="block font-mono text-[10px] text-ink-secondary">{formatDuration(run.duration_seconds)}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function FlowEmpty({ hasDags }: { hasDags: boolean }) {
  return (
    <div className="border-l-2 border-ink/80 py-1 pl-5">
      <h2 className="font-display text-[22px] text-ink">{hasDags ? 'Your DAGs are ready to connect.' : 'Start with a DAG, then connect the work.'}</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-5 text-ink-secondary">
        Flows coordinate complete processes across DAG boundaries. DAGs remain independently runnable and reusable.
      </p>
      {hasDags && <Link to="/ui/dags" className="mt-3 inline-block text-[12px] text-accent hover:underline">View registered DAGs →</Link>}
    </div>
  )
}
