import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'
import { ErrorState } from '../components/QueryState'
import { RelativeTime } from '../components/RelativeTime'
import { SkeletonRows } from '../components/Skeleton'
import { StateBadge } from '../components/StatusBadge'
import { useShortcut } from '../hooks/useShortcut'
import { useUrlState } from '../hooks/useUrlState'
import { formatDuration } from '../lib/utils'
import type { FlowRun } from '../types'

export function FlowList() {
  const flowsQ = useQuery({ queryKey: ['flows'], queryFn: api.getFlows, refetchInterval: 5000 })
  const runsQ = useQuery({
    queryKey: ['flow-history'],
    queryFn: () => api.getFlowHistory(300),
    refetchInterval: 5000,
  })
  const [filter, setFilter] = useUrlState<string>('q', '')
  const [onlyRunning, setOnlyRunning] = useUrlState<boolean>(
    'running',
    false,
    (raw) => raw === '1',
    (value) => value ? '1' : null,
  )
  const filterRef = useRef<HTMLInputElement>(null)

  useShortcut('/', (event) => {
    event.preventDefault()
    filterRef.current?.focus()
    filterRef.current?.select()
  })

  const runsByFlow = useMemo(() => {
    const values = new Map<string, FlowRun[]>()
    for (const run of runsQ.data ?? []) {
      const current = values.get(run.flow_id) ?? []
      current.push(run)
      values.set(run.flow_id, current)
    }
    return values
  }, [runsQ.data])

  const rows = useMemo(() => {
    let values = flowsQ.data ?? []
    if (onlyRunning) values = values.filter((flow) => flow.is_running)
    if (filter.trim()) {
      const query = filter.trim().toLowerCase()
      values = values.filter((flow) =>
        [flow.flow_id, flow.description, ...flow.nodes.map((node) => node.dag_id)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query)),
      )
    }
    return values
  }, [filter, flowsQ.data, onlyRunning])

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-7 pb-12 sm:px-6 sm:pt-10 sm:pb-14 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          Orchestration
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          {flowsQ.data ? `${rows.length} / ${flowsQ.data.length}` : ''}
        </span>
      </div>
      <div className="border-t border-ink" />

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-normal leading-[1.1] tracking-[-0.015em] text-ink">
            Flows
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-5 text-ink-secondary">
            End-to-end orchestration. Each Flow coordinates one or more reusable DAGs.
          </p>
        </div>
        <Link
          to="/ui/dags"
          className="text-[13px] text-ink-muted transition-colors hover:text-accent"
        >
          Browse DAG library →
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3">
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by Flow or DAG…  press / to focus"
          aria-label="Filter Flows"
          className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[14px] text-ink placeholder:text-ink-muted focus:outline-none sm:w-80 sm:flex-none"
        />
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-secondary select-none">
          <input
            type="checkbox"
            checked={onlyRunning}
            onChange={(event) => setOnlyRunning(event.target.checked)}
            className="size-3 accent-(--color-accent)"
          />
          Running only
        </label>
      </div>

      {flowsQ.isLoading ? (
        <div className="pt-5"><SkeletonRows rows={6} columns={5} /></div>
      ) : flowsQ.isError ? (
        <ErrorState error={flowsQ.error} onRetry={() => flowsQ.refetch()} className="py-14" />
      ) : (flowsQ.data?.length ?? 0) === 0 ? (
        <EmptyFlows />
      ) : rows.length === 0 ? (
        <p className="py-20 text-sm text-ink-muted">No Flows match “{filter}”.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="mt-1 min-w-220 w-full table-fixed">
            <colgroup>
              <col />
              <col className="w-26" />
              <col className="w-52" />
              <col className="w-35" />
              <col className="w-35" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                <th className="py-2.5">Flow</th>
                <th className="py-2.5">State</th>
                <th className="py-2.5">DAG path</th>
                <th className="py-2.5">Latest run</th>
                <th className="py-2.5">Schedule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((flow) => {
                const latest = runsByFlow.get(flow.flow_id)?.[0]
                return (
                  <tr key={flow.flow_id} className="group align-top">
                    <td className="py-3.5 pr-8">
                      <Link
                        to={`/ui/flows/${flow.flow_id}`}
                        className="text-[15px] font-medium text-ink transition-colors hover:text-accent"
                      >
                        {flow.flow_id}
                      </Link>
                      {flow.description && (
                        <p className="mt-0.5 line-clamp-1 text-[12px] leading-4 text-ink-muted">
                          {flow.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5"><StateBadge state={flow.is_running ? 'running' : latest?.state ?? 'idle'} /></td>
                    <td className="py-3.5">
                      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-ink-secondary">
                        {flow.nodes.slice(0, 3).map((node, index) => (
                          <span key={node.node_id} className="contents">
                            {index > 0 && <span className="text-border-bright">→</span>}
                            <span className="max-w-28 truncate" title={node.dag_id}>{node.dag_id}</span>
                          </span>
                        ))}
                        {flow.nodes.length > 3 && (
                          <span className="shrink-0 text-ink-muted">+{flow.nodes.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5">
                      {latest ? (
                        <Link
                          to={`/ui/flows/${flow.flow_id}/runs/${latest.run_id}`}
                          className="group/run block"
                        >
                          <RelativeTime iso={latest.start_time} className="font-mono text-[11px] text-ink-secondary group-hover/run:text-accent" />
                          <span className="ml-2 font-mono text-[11px] text-ink-muted">
                            {formatDuration(latest.duration_seconds)}
                          </span>
                        </Link>
                      ) : (
                        <span className="font-mono text-[11px] text-ink-muted">No runs</span>
                      )}
                    </td>
                    <td className="py-3.5 font-mono text-[11px] text-ink-muted">
                      {flow.next_run
                        ? <><span>{flow.schedule_display}</span> · <RelativeTime iso={flow.next_run} /></>
                        : flow.schedule_display ?? 'Manual'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyFlows() {
  return (
    <div className="grid gap-8 py-16 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">No Flows registered</p>
        <h2 className="mt-3 font-display text-[28px] leading-tight text-ink">
          DAGs can run alone. Flows connect them.
        </h2>
        <p className="mt-4 max-w-xl text-[14px] leading-6 text-ink-secondary">
          A DAG owns task-level work. A Flow orders DAG runs into an end-to-end process,
          while keeping each DAG independently inspectable and reusable.
        </p>
      </div>
      <pre className="overflow-x-auto border-l-2 border-border bg-bg-raised px-5 py-4 font-mono text-[12px] leading-6 text-ink">
{`with Flow("daily_pipeline") as flow:
    ingest = flow.add_dag(ingest_dag)
    publish = flow.add_dag(publish_dag)

    ingest >> publish

serve(flow)`}
      </pre>
    </div>
  )
}
