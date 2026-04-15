import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function Settings() {
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 10000,
  })

  if (!status) return <div className="px-8 py-8 text-sm text-ink-muted">Loading…</div>

  return (
    <div className="px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-ink-secondary">System configuration and status</p>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-secondary">System status</h2>
        <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
          <Row label="Registered DAGs" value={String(status.registered_dags.length)} />
          <Row label="Running DAGs" value={String(status.running_dags.length)} />
          <Row label="Total history" value={String(status.total_history)} />
          <Row label="Active WebSocket connections" value={String(status.active_connections)} />
          <Row label="Server time" value={new Date(status.timestamp).toLocaleString()} />
        </dl>
      </section>

      {status.registered_dags.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-ink-secondary">Registered DAGs</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {status.registered_dags.map((id) => (
              <span key={id} className="rounded-md border border-border bg-bg-raised px-2.5 py-1 text-xs font-medium">
                {id}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
