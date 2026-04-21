import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api'
import { TimeSeriesChart } from '../components/TimeSeriesChart'
import { ErrorState } from '../components/QueryState'
import { cn } from '../lib/utils'
import type { HostSamplePoint } from '../types'

/**
 * Host — single-host observability surface.
 * All four metric families (CPU, memory, disk, network) are stacked on a
 * shared time axis so spikes can be correlated at a glance. This is a
 * diagnostic view; tabs would hide the very comparisons it exists for.
 */
export function Host() {
  const metricsQ = useQuery({
    queryKey: ['host-metrics'],
    queryFn: () => api.getHostMetrics(60),
    refetchInterval: 5000,
  })

  const metrics = metricsQ.data

  // Shared crosshair — hovering any chart highlights the same sample
  // across all four, because the whole point of this surface is to
  // correlate spikes across resource families.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  return (
    <div className="mx-auto max-w-7xl px-8 pt-10 pb-14">
      {/* Masthead */}
      <div className="mb-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
        <span>
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        <span>Host</span>
      </div>
      <div className="border-t border-ink" />

      {/* Headline + current-state band */}
      <div className="flex items-end justify-between gap-10 pt-8 pb-8">
        <div>
          <h1 className="font-display text-[34px] font-light leading-[1.05] tracking-[-0.015em] text-ink">
            Host metrics
          </h1>
          {metrics && (
            <p className="mt-2 font-mono text-[11px] text-ink-muted">
              {metrics.cpu_count} cores · {metrics.disk_path} · every{' '}
              {metrics.interval_seconds}s · {metrics.samples.length} samples
            </p>
          )}
        </div>
        {metrics && metrics.samples.length > 0 && (
          <CurrentBand sample={metrics.samples[metrics.samples.length - 1]} />
        )}
      </div>

      {/* Stacked diagnostic layout — one shared x-axis mental model */}
      {metricsQ.isLoading ? (
        <p className="border-t border-border py-20 text-center font-mono text-[11px] text-ink-muted">
          Loading…
        </p>
      ) : metricsQ.isError ? (
        <div className="border-t border-border pt-10">
          <ErrorState error={metricsQ.error} onRetry={() => metricsQ.refetch()} />
        </div>
      ) : !metrics || metrics.samples.length === 0 ? (
        <p className="border-t border-border py-20 text-center font-mono text-[11px] text-ink-muted">
          Collecting samples…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 border-t border-border pt-8 lg:grid-cols-2">
          <Section label="CPU">
            <CPUTab
              samples={metrics.samples}
              cpuCount={metrics.cpu_count}
              hoverIndex={hoverIndex}
              onHoverChange={setHoverIndex}
            />
          </Section>
          <Section label="Memory">
            <MemoryTab
              samples={metrics.samples}
              hoverIndex={hoverIndex}
              onHoverChange={setHoverIndex}
            />
          </Section>
          <Section label="Disk">
            <DiskTab
              samples={metrics.samples}
              hoverIndex={hoverIndex}
              onHoverChange={setHoverIndex}
            />
          </Section>
          <Section label="Network">
            <NetworkTab
              samples={metrics.samples}
              hoverIndex={hoverIndex}
              onHoverChange={setHoverIndex}
            />
          </Section>
        </div>
      )}
    </div>
  )
}

/* ── Section wrapper: editorial section label + content ── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3 border-b border-border pb-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
          {label}
        </h2>
      </div>
      {children}
    </section>
  )
}

/* ── Current-state band (small-caps + big mono numbers) ── */

function CurrentBand({ sample }: { sample: HostSamplePoint }) {
  return (
    <dl className="grid grid-cols-4 gap-8 text-right">
      <Stat label="CPU" value={`${sample.cpu_percent.toFixed(0)}%`} />
      <Stat label="Memory" value={`${sample.mem_percent.toFixed(0)}%`} />
      <Stat label="Disk" value={`${sample.disk_percent.toFixed(0)}%`} />
      <Stat
        label="Net"
        value={`${formatBytesPerSec(sample.net_rx_bytes_per_sec + sample.net_tx_bytes_per_sec)}`}
      />
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-[18px] tabular-nums text-ink">{value}</dd>
    </div>
  )
}

/* ── Shared helpers for all tabs ─────────────────────── */

function useChartInputs(samples: HostSamplePoint[]) {
  return useMemo(() => {
    const ts = samples.map((s) => new Date(s.timestamp).getTime() / 1000)
    return { ts }
  }, [samples])
}

/* ── Tabs ──────────────────────────────────────────────── */

interface TabProps {
  samples: HostSamplePoint[]
  hoverIndex: number | null
  onHoverChange: (i: number | null) => void
}

function CPUTab({
  samples,
  cpuCount,
  hoverIndex,
  onHoverChange,
}: TabProps & { cpuCount: number }) {
  const { ts } = useChartInputs(samples)
  const cpu = samples.map((s) => s.cpu_percent)
  const load = samples.map((s) => (s.load_1 / cpuCount) * 100)

  return (
    <section>
      <ChartHead subtitle="Per-core average, 1-minute load average" />
      <TimeSeriesChart
        timestamps={ts}
        series={[
          { label: 'CPU %', values: cpu, color: 'accent' },
          { label: 'Load avg / core', values: load, color: 'ink-muted', dashed: true },
        ]}
        formatY={(v) => `${v.toFixed(0)}%`}
        yMax={100}
        hoverIndex={hoverIndex}
        onHoverChange={onHoverChange}
      />
      <Legend
        items={[
          { color: 'accent', label: 'CPU usage' },
          { color: 'ink-muted', label: 'Load / core (1-min avg)', dashed: true },
        ]}
      />
    </section>
  )
}

function MemoryTab({ samples, hoverIndex, onHoverChange }: TabProps) {
  const { ts } = useChartInputs(samples)
  const memUsed = samples.map((s) => s.mem_used / 1024 ** 3)
  const swapUsed = samples.map((s) => s.swap_used / 1024 ** 3)
  const total = samples[samples.length - 1]?.mem_total ?? 0
  const totalGiB = total / 1024 ** 3

  return (
    <section>
      <ChartHead
        subtitle={`Resident and swap, GiB of ${totalGiB.toFixed(1)} GiB total`}
      />
      <TimeSeriesChart
        timestamps={ts}
        series={[
          { label: 'Memory', values: memUsed, color: 'accent' },
          { label: 'Swap', values: swapUsed, color: 'warning', dashed: true },
        ]}
        formatY={(v) => `${v.toFixed(1)}G`}
        reference={totalGiB > 0 ? { value: totalGiB, label: 'total' } : undefined}
        hoverIndex={hoverIndex}
        onHoverChange={onHoverChange}
      />
      <Legend
        items={[
          { color: 'accent', label: 'Resident memory' },
          { color: 'warning', label: 'Swap', dashed: true },
        ]}
      />
    </section>
  )
}

function DiskTab({ samples, hoverIndex, onHoverChange }: TabProps) {
  const { ts } = useChartInputs(samples)
  const reads = samples.map((s) => s.disk_read_bytes_per_sec)
  const writes = samples.map((s) => s.disk_write_bytes_per_sec)
  const last = samples[samples.length - 1]
  const pct = last?.disk_percent ?? 0
  const usedGiB = (last?.disk_used ?? 0) / 1024 ** 3
  const totalGiB = (last?.disk_total ?? 0) / 1024 ** 3

  return (
    <section>
      <ChartHead
        subtitle={`${usedGiB.toFixed(1)} / ${totalGiB.toFixed(1)} GiB used (${pct.toFixed(0)}%)`}
      />
      <TimeSeriesChart
        timestamps={ts}
        series={[
          { label: 'Read', values: reads, color: 'accent' },
          { label: 'Write', values: writes, color: 'warning' },
        ]}
        formatY={formatBytesPerSec}
        hoverIndex={hoverIndex}
        onHoverChange={onHoverChange}
      />
      <Legend
        items={[
          { color: 'accent', label: 'Read' },
          { color: 'warning', label: 'Write' },
        ]}
      />
    </section>
  )
}

function NetworkTab({ samples, hoverIndex, onHoverChange }: TabProps) {
  const { ts } = useChartInputs(samples)
  const rx = samples.map((s) => s.net_rx_bytes_per_sec)
  const tx = samples.map((s) => s.net_tx_bytes_per_sec)

  return (
    <section>
      <ChartHead subtitle="RX / TX aggregate, all interfaces" />
      <TimeSeriesChart
        timestamps={ts}
        series={[
          { label: 'RX', values: rx, color: 'accent' },
          { label: 'TX', values: tx, color: 'success' },
        ]}
        formatY={formatBytesPerSec}
        hoverIndex={hoverIndex}
        onHoverChange={onHoverChange}
      />
      <Legend
        items={[
          { color: 'accent', label: 'Received (RX)' },
          { color: 'success', label: 'Transmitted (TX)' },
        ]}
      />
    </section>
  )
}

/* ── Bits ──────────────────────────────────────────────── */

function ChartHead({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-3">
      <p className="font-mono text-[11px] text-ink-muted">{subtitle}</p>
    </div>
  )
}

function Legend({
  items,
}: {
  items: { color: 'accent' | 'success' | 'warning' | 'error' | 'ink-muted'; label: string; dashed?: boolean }[]
}) {
  const cls: Record<typeof items[number]['color'], string> = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
    'ink-muted': 'bg-ink-muted',
  }
  return (
    <div className="mt-3 flex gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
      {items.map((i, k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block h-0.5 w-4',
              cls[i.color],
              i.dashed && 'opacity-60',
            )}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`
  if (bps < 1024 ** 3) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
  return `${(bps / 1024 ** 3).toFixed(2)} GB/s`
}
