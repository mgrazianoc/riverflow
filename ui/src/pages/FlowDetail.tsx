import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { api } from '../api'
import { Play } from '../components/icons'
import { EmptyState, ErrorState } from '../components/QueryState'
import { RelativeTime } from '../components/RelativeTime'
import { SkeletonRows } from '../components/Skeleton'
import { StateBadge } from '../components/StatusBadge'
import { useShortcut } from '../hooks/useShortcut'
import { useToast } from '../hooks/useToast'
import { useUrlState } from '../hooks/useUrlState'
import { cn, errorMessage, formatDuration } from '../lib/utils'
import type { FlowRunState } from '../types'

const tabs = [
  { to: 'graph', label: 'Graph' },
  { to: 'overview', label: 'Overview' },
  { to: 'runs', label: 'Runs' },
]

export function FlowDetail() {
  const { flowId } = useParams<{ flowId: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()
  const flowQ = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => api.getFlow(flowId!),
    enabled: !!flowId,
    refetchInterval: 5000,
  })
  const flow = flowQ.data
  const trigger = useMutation({
    mutationFn: () => api.triggerFlow(flowId!),
    onSuccess: (run) => {
      toast.push(`Triggered flow ${run.flow_id}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['flow', flowId] })
      queryClient.invalidateQueries({ queryKey: ['flow-history'] })
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  })

  useShortcut('t', () => {
    if (flow && !trigger.isPending && !flow.is_running) trigger.mutate()
  }, { enabled: !!flow })

  if (flowQ.isLoading) {
    return <div className="px-10 py-10"><SkeletonRows rows={5} columns={3} /></div>
  }
  if (flowQ.isError) {
    return <ErrorState error={flowQ.error} onRetry={() => flowQ.refetch()} />
  }
  if (!flow) return null

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border bg-bg">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-12 min-w-0 items-center gap-3 min-[760px]:h-14 min-[760px]:gap-4">
            <Link
              to="/ui/flows"
              className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:text-ink"
            >
              ← Flows
            </Link>
            <div className="h-5 w-px shrink-0 bg-border" />
            <div className="flex min-w-0 items-center gap-2.5" title={flow.description ?? undefined}>
              <h1 className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap py-1 font-display text-[20px] font-normal leading-[1.25] text-ink">
                {flow.flow_id}
              </h1>
              <StateBadge state={flow.is_running ? 'running' : 'idle'} compact />
            </div>
            <span className="hidden shrink-0 font-mono text-[11px] text-ink-muted lg:inline">
              {flow.nodes.length} {flow.nodes.length === 1 ? 'DAG' : 'DAGs'}
              {flow.schedule_display ? ` · ${flow.schedule_display}` : ' · manual'}
            </span>
            <FlowTabs className="ml-auto hidden h-full min-[760px]:flex" />
            <button
              type="button"
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending || flow.is_running}
              title={flow.is_running ? 'Flow is already running' : 'Trigger Flow (t)'}
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[13px] font-medium text-bg transition-colors hover:border-accent hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 min-[760px]:ml-2"
            >
              <Play size={11} />
              {flow.is_running ? 'Running' : 'Trigger'}
              <kbd className="ml-1 hidden rounded-sm border border-bg/30 px-1 font-mono text-[10px] sm:inline">t</kbd>
            </button>
          </div>
          <FlowTabs className="flex h-10 min-[760px]:hidden" />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}

function FlowTabs({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Flow views"
      className={cn(
        'min-w-0 items-stretch gap-5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => cn(
            'flex h-full shrink-0 items-center border-b-2 text-[13px] transition-colors',
            isActive ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink-secondary',
          )}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function FlowOverview() {
  const { flowId } = useParams<{ flowId: string }>()
  const flowQ = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => api.getFlow(flowId!),
    enabled: !!flowId,
  })
  const runsQ = useQuery({
    queryKey: ['flow-history', flowId],
    queryFn: () => api.getFlowHistory(8, flowId),
    enabled: !!flowId,
    refetchInterval: 5000,
  })
  const flow = flowQ.data
  if (!flow) return null

  return (
    <div className="mx-auto grid max-w-[1440px] gap-9 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:px-8">
      <section>
        {flow.description && (
          <p className="mb-6 max-w-3xl border-l-2 border-border pl-4 text-[15px] leading-6 text-ink-secondary">
            {flow.description}
          </p>
        )}
        <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2.5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">DAG sequence</h2>
          <span className="font-mono text-[11px] text-ink-muted">{flow.nodes.length} nodes</span>
        </div>
        <div className="divide-y divide-border/60">
          {flow.nodes.map((node, index) => (
            <div key={node.node_id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className="font-mono text-[11px] text-ink-muted">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0">
                <Link to={`/ui/dags/${node.dag_id}`} className="block truncate text-[14px] text-ink hover:text-accent">
                  {node.dag_id}
                </Link>
                {node.node_id !== node.dag_id && (
                  <span className="block truncate font-mono text-[10px] text-ink-muted">node {node.node_id}</span>
                )}
              </span>
              <span className="text-right font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
                {node.upstream_node_ids.length === 0 ? 'entry' : `after ${node.upstream_node_ids.length}`}
              </span>
            </div>
          ))}
        </div>
      </section>
      <aside>
        <h2 className="mb-3 border-b border-border pb-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          Definition
        </h2>
        <dl className="space-y-2.5 text-[13px]">
          <Info label="Timezone" value={flow.timezone} />
          <Info label="Schedule" value={flow.schedule_display ?? 'Manual'} />
          <Info label="Next run" value={flow.next_run ? undefined : '—'}>
            {flow.next_run && <RelativeTime iso={flow.next_run} />}
          </Info>
          <Info label="State" value={flow.is_running ? 'Running' : 'Idle'} />
        </dl>
        <h2 className="mt-8 mb-2 border-b border-border pb-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          Recent runs
        </h2>
        {runsQ.isError ? (
          <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} className="py-6" />
        ) : (
          <div className="divide-y divide-border/60">
            {(runsQ.data ?? []).slice(0, 5).map((run) => (
              <Link
                key={run.run_id}
                to={`/ui/flows/${flow.flow_id}/runs/${run.run_id}`}
                className="flex items-center gap-3 py-2.5 hover:text-accent"
              >
                <StateBadge state={run.state} compact />
                <RelativeTime iso={run.start_time} className="flex-1 font-mono text-[11px]" />
                <span className="font-mono text-[11px] text-ink-muted">{formatDuration(run.duration_seconds)}</span>
              </Link>
            ))}
            {!runsQ.isLoading && (runsQ.data?.length ?? 0) === 0 && (
              <p className="py-5 text-[13px] text-ink-muted">No runs yet.</p>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Info({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono text-[11px] text-ink">{children ?? value}</dd>
    </div>
  )
}

const stateFilters: Array<{ label: string; value: FlowRunState | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
]

export function FlowRuns() {
  const { flowId } = useParams<{ flowId: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()
  const runsQ = useQuery({
    queryKey: ['flow-history', flowId],
    queryFn: () => api.getFlowHistory(100, flowId),
    enabled: !!flowId,
    refetchInterval: 5000,
  })
  const [state, setState] = useUrlState<FlowRunState | 'all'>(
    'state',
    'all',
    (raw) => ['running', 'success', 'failed'].includes(raw) ? raw as FlowRunState : 'all',
    (value) => value === 'all' ? null : value,
  )
  const clear = useMutation({
    mutationFn: () => api.clearFlowHistory(flowId!),
    onSuccess: (result) => {
      toast.push(`Cleared ${result.cleared} Flow run${result.cleared === 1 ? '' : 's'}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['flow-history'] })
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  })
  const rows = useMemo(
    () => (runsQ.data ?? []).filter((run) => state === 'all' || run.state === state),
    [runsQ.data, state],
  )

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-3 flex flex-wrap items-center gap-5 border-b border-border pb-3">
        <div className="flex gap-4 font-mono text-[11px] uppercase tracking-[0.1em]">
          {stateFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setState(filter.value)}
              className={state === filter.value ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary'}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          {runsQ.data ? `${rows.length} / ${runsQ.data.length}` : ''}
        </span>
        {(runsQ.data?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Clear all run history for Flow "${flowId}"?`)) clear.mutate()
            }}
            disabled={clear.isPending}
            className="text-[12px] text-ink-muted hover:text-error disabled:opacity-40"
          >
            Clear history
          </button>
        )}
      </div>
      {runsQ.isLoading ? (
        <SkeletonRows rows={7} columns={5} />
      ) : runsQ.isError ? (
        <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} className="py-12" />
      ) : rows.length === 0 ? (
        <EmptyState title="No Flow runs" hint={state === 'all' ? 'Press t to trigger this Flow.' : 'No runs match this state.'} />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-195 w-full">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                <th className="py-2.5">State</th>
                <th className="py-2.5">Run ID</th>
                <th className="py-2.5">Started</th>
                <th className="py-2.5">Trigger</th>
                <th className="py-2.5 text-right">DAGs</th>
                <th className="py-2.5 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((run) => (
                <tr key={run.run_id}>
                  <td className="py-3"><StateBadge state={run.state} /></td>
                  <td className="py-3">
                    <Link to={`/ui/flows/${flowId}/runs/${run.run_id}`} className="font-mono text-[12px] text-ink-secondary hover:text-accent">
                      {run.run_id}
                    </Link>
                  </td>
                  <td className="py-3 font-mono text-[12px] text-ink-muted"><RelativeTime iso={run.start_time} /></td>
                  <td className="py-3 font-mono text-[11px] text-ink-muted">{run.trigger_source ?? 'manual'}{run.trigger_mode ? ` / ${run.trigger_mode}` : ''}</td>
                  <td className="py-3 text-right font-mono text-[12px] text-ink-secondary">{Object.keys(run.node_states).length}</td>
                  <td className="py-3 text-right font-mono text-[12px] text-ink-secondary">{formatDuration(run.duration_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
