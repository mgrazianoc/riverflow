import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { formatRate, formatDuration } from '../lib/utils'
import type { DAGSummary } from '../types'

export function DAGList() {
  const { data: dags = [] } = useQuery({ queryKey: ['dags'], queryFn: api.getDags, refetchInterval: 5000 })

  return (
    <div className="px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight">DAGs</h1>
      <p className="mt-1 text-sm text-ink-secondary">{dags.length} registered</p>

      <div className="mt-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium text-ink-muted">
              <th className="pb-2.5 font-medium">Name</th>
              <th className="pb-2.5 font-medium">Status</th>
              <th className="pb-2.5 font-medium text-right">Runs</th>
              <th className="pb-2.5 font-medium text-right">Success</th>
              <th className="pb-2.5 font-medium text-right">Avg duration</th>
              <th className="pb-2.5 font-medium">Schedule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dags.map((d) => (
              <Row key={d.dag_id} dag={d} />
            ))}
          </tbody>
        </table>
        {dags.length === 0 && (
          <p className="py-16 text-center text-sm text-ink-muted">No DAGs registered</p>
        )}
      </div>
    </div>
  )
}

function Row({ dag }: { dag: DAGSummary }) {
  return (
    <tr className="group transition-colors hover:bg-bg-hover">
      <td className="py-3">
        <Link to={`/ui/dags/${dag.dag_id}`} className="font-medium text-ink hover:text-accent">
          {dag.dag_id}
        </Link>
      </td>
      <td className="py-3">
        <StateBadge state={dag.is_running ? 'running' : 'idle'} />
      </td>
      <td className="py-3 tabular-nums text-right text-ink-secondary">{dag.total_runs}</td>
      <td className="py-3 tabular-nums text-right text-ink-secondary">
        {dag.total_runs > 0 ? formatRate(dag.success_rate) : '—'}
      </td>
      <td className="py-3 tabular-nums text-right text-ink-secondary">
        {dag.avg_duration_seconds > 0 ? formatDuration(dag.avg_duration_seconds) : '—'}
      </td>
      <td className="py-3 text-ink-muted">{dag.schedule_display ?? '—'}</td>
    </tr>
  )
}
