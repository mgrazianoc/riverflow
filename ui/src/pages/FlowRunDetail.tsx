import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { ErrorState } from '../components/QueryState'
import { RelativeTime } from '../components/RelativeTime'
import { SkeletonRows } from '../components/Skeleton'
import { StateBadge } from '../components/StatusBadge'
import { formatDuration } from '../lib/utils'

export function FlowRunDetail() {
  const { flowId, runId } = useParams<{ flowId: string; runId: string }>()
  const flowQ = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => api.getFlow(flowId!),
    enabled: !!flowId,
  })
  const runsQ = useQuery({
    queryKey: ['flow-history', flowId],
    queryFn: () => api.getFlowHistory(100, flowId),
    enabled: !!flowId,
    refetchInterval: 3000,
  })
  const run = runsQ.data?.find((value) => value.run_id === runId)

  if (flowQ.isLoading || runsQ.isLoading) {
    return <div className="mx-auto max-w-[1440px] px-8 py-10"><SkeletonRows rows={7} columns={4} /></div>
  }
  if (flowQ.isError || runsQ.isError) {
    const query = flowQ.isError ? flowQ : runsQ
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }
  if (!run || !flowQ.data) {
    return <ErrorState error={new Error(`Unknown Flow run: ${runId}`)} />
  }
  const flow = flowQ.data

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-12 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-ink pb-4">
        <Link
          to={`/ui/flows/${flow.flow_id}/runs`}
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted hover:text-ink"
        >
          ← {flow.flow_id}
        </Link>
        <div className="h-4 w-px bg-border" />
        <span className="min-w-0 truncate font-mono text-[12px] text-ink-secondary">{run.run_id}</span>
        <StateBadge state={run.state} />
      </div>

      <div className="grid gap-9 pt-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.6fr)]">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h1 className="font-display text-[28px] leading-tight text-ink">DAG runs</h1>
            <span className="font-mono text-[11px] text-ink-muted">
              {Object.keys(run.node_states).length} / {flow.nodes.length} started
            </span>
          </div>
          <div className="border-t border-border">
            {flow.nodes.map((node, index) => {
              const state = run.node_states[node.node_id] ?? 'none'
              const childRunId = run.dag_run_ids[node.node_id]
              const error = run.node_errors[node.node_id]
              return (
                <div key={node.node_id} className="grid grid-cols-[2rem_auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-border/60 py-3">
                  <span className="pt-0.5 font-mono text-[10px] text-ink-muted">{String(index + 1).padStart(2, '0')}</span>
                  <StateBadge state={state} compact className="pt-1.5" />
                  <span className="min-w-0">
                    <Link to={`/ui/dags/${node.dag_id}`} className="block truncate text-[14px] text-ink hover:text-accent">
                      {node.dag_id}
                    </Link>
                    {error && <span className="mt-0.5 block truncate font-mono text-[10px] text-error" title={error}>{error}</span>}
                    <span className="block font-mono text-[10px] text-ink-muted">{state.replaceAll('_', ' ')}</span>
                  </span>
                  {childRunId ? (
                    <Link to={`/ui/runs/${childRunId}`} className="font-mono text-[11px] text-ink-secondary hover:text-accent">
                      Inspect run →
                    </Link>
                  ) : (
                    <span className="font-mono text-[10px] text-ink-muted">Not started</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <aside>
          <h2 className="mb-3 border-b border-border pb-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">Run context</h2>
          <dl className="space-y-2.5 text-[13px]">
            <Info label="Started"><RelativeTime iso={run.start_time} /></Info>
            <Info label="Duration">{formatDuration(run.duration_seconds)}</Info>
            <Info label="Trigger">{run.trigger_source ?? 'manual'}{run.trigger_mode ? ` / ${run.trigger_mode}` : ''}</Info>
            <Info label="Requested by">{run.requested_by ?? '—'}</Info>
          </dl>
          {Object.keys(run.parameters).length > 0 && (
            <>
              <h2 className="mt-8 mb-3 border-b border-border pb-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">Parameters</h2>
              <pre className="overflow-x-auto bg-bg-raised p-3 font-mono text-[11px] leading-5 text-ink-secondary">
                {JSON.stringify(run.parameters, null, 2)}
              </pre>
            </>
          )}
          {run.error && (
            <div className="mt-7 border-l-2 border-error pl-4">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-error">Flow error</h2>
              <p className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5 text-error">{run.error}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-mono text-[11px] text-ink">{children}</dd>
    </div>
  )
}
