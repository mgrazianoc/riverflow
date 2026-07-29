import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'

export function Settings() {
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 10000,
  })

  if (!status)
    return (
      <div className="mx-auto max-w-[1180px] px-4 pt-7 font-mono text-[12px] text-ink-muted sm:px-6 sm:pt-10 lg:px-8">
        Loading…
      </div>
    )

  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-7 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="mb-6 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <span>System</span>
      </div>
      <div className="border-t border-ink" />

      <h1 className="mt-7 font-display text-[34px] font-normal leading-[1.08] tracking-[-0.015em] text-ink">
        System
      </h1>
      <p className="mt-2 text-[14px] text-ink-secondary">
        Server configuration and runtime status.
      </p>

      <section className="mt-9">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          Status
        </div>
        <dl className="divide-y divide-border border-t border-b border-border">
          <Row label="Registered DAGs" value={String(status.registered_dags.length)} />
          <Row label="Running DAGs" value={String(status.running_dags.length)} />
          <Row label="Total history" value={String(status.total_history)} />
          <Row label="Active WebSocket connections" value={String(status.active_connections)} />
          <Row label="Server time" value={new Date(status.timestamp).toLocaleString()} />
        </dl>
      </section>

      {status.registered_dags.length > 0 && (
        <section className="mt-9">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
            Registered DAGs
          </div>
          <div className="flex flex-wrap gap-1.5">
            {status.registered_dags.map((id) => (
              <Link
                key={id}
                to={`/ui/dags/${id}`}
                className="rounded-sm border border-border bg-bg-raised px-2 py-1 font-mono text-[12px] text-ink-secondary"
              >
                {id}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 px-1 py-3.5">
      <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">{label}</dt>
      <dd className="text-right font-mono text-[14px] tabular-nums text-ink">{value}</dd>
    </div>
  )
}
