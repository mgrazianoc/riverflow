import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useMemo, useRef } from 'react'
import { api } from '../api'
import { RunStrip } from '../components/RunStrip'
import { Sparkline } from '../components/Sparkline'
import { RelativeTime } from '../components/RelativeTime'
import { SkeletonRows } from '../components/Skeleton'
import { ErrorState } from '../components/QueryState'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useUrlState } from '../hooks/useUrlState'
import { usePrefetchDag } from '../hooks/usePrefetchDag'
import { useRowNav } from '../hooks/useRowNav'
import { useShortcut } from '../hooks/useShortcut'
import { formatRate, formatDuration, cn } from '../lib/utils'
import type { DAGRun, DAGSummary } from '../types'

type SortKey = 'dag_id' | 'total_runs' | 'success_rate' | 'avg_duration_seconds'
type SortDir = 'asc' | 'desc'
interface SortState { key: SortKey; dir: SortDir }
const DEFAULT_SORT: SortState = { key: 'dag_id', dir: 'asc' }

export function DAGList() {
  const dagsQ = useQuery({ queryKey: ['dags'], queryFn: api.getDags, refetchInterval: 5000 })
  const runsQ = useQuery({ queryKey: ['history'], queryFn: () => api.getHistory(500), refetchInterval: 5000 })

  // Sort is a personal preference → localStorage.
  const [sort, setSort] = useLocalStorage<SortState>('riverflow:dags:sort', DEFAULT_SORT)
  // Filter + running toggle are shareable → URL.
  const [filter, setFilter] = useUrlState<string>('q', '')
  const [onlyRunning, setOnlyRunning] = useUrlState<boolean>(
    'running',
    false,
    (raw) => raw === '1',
    (v) => (v ? '1' : null),
  )

  const runsByDag = useMemo(() => {
    const m = new Map<string, DAGRun[]>()
    for (const r of runsQ.data ?? []) {
      const arr = m.get(r.dag_id) ?? []
      arr.push(r)
      m.set(r.dag_id, arr)
    }
    return m
  }, [runsQ.data])

  const rows = useMemo(() => {
    let r = dagsQ.data ?? []
    if (onlyRunning) r = r.filter((d) => d.is_running)
    if (filter.trim()) {
      const q = filter.toLowerCase()
      r = r.filter((d) => d.dag_id.toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = Number(av) || 0
      const bn = Number(bv) || 0
      return sort.dir === 'asc' ? an - bn : bn - an
    })
  }, [dagsQ.data, filter, onlyRunning, sort])

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  // Keyboard navigation
  const filterRef = useRef<HTMLInputElement>(null)
  useShortcut('/', (e) => {
    e.preventDefault()
    filterRef.current?.focus()
    filterRef.current?.select()
  })
  useRowNav('tr[data-row="dag"]', [rows.length])

  return (
    <div className="mx-auto max-w-7xl px-8 pt-10 pb-14">
      {/* Masthead label */}
      <div className="mb-6 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          Pipelines
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          {dagsQ.data ? `${rows.length} / ${dagsQ.data.length}` : ''}
        </span>
      </div>
      <div className="border-t border-ink" />

      {/* Headline */}
      <h1 className="mt-8 font-display text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-ink">
        All DAGs
      </h1>

      {/* Inline controls */}
      <div className="mt-6 flex items-center gap-6 border-b border-border pb-3">
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…  press / to focus"
          className="w-72 border-0 bg-transparent py-1 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-secondary select-none">
          <input
            type="checkbox"
            checked={onlyRunning}
            onChange={(e) => setOnlyRunning(e.target.checked)}
            className="size-3 accent-(--color-accent)"
          />
          Running only
        </label>
      </div>

      {dagsQ.isLoading ? (
        <div className="pt-5"><SkeletonRows rows={6} columns={5} /></div>
      ) : dagsQ.isError ? (
        <ErrorState error={dagsQ.error} onRetry={() => dagsQ.refetch()} className="py-14" />
      ) : (dagsQ.data?.length ?? 0) === 0 ? (
        <EmptyDagsEditorial />
      ) : rows.length === 0 ? (
        <p className="py-20 text-sm text-ink-muted">No matches for “{filter}”.</p>
      ) : (
        <table className="mt-1 w-full">
          <colgroup>
            <col />
            <col className="w-32.5" />
            <col className="w-35" />
            <col className="w-30" />
            <col className="w-27.5" />
            <col className="w-42.5" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              <SortTh label="Name" k="dag_id" sort={sort} onClick={toggleSort} />
              <th className="py-2.5">Last 20</th>
              <th className="py-2.5">Duration</th>
              <SortTh label="Runs" k="total_runs" sort={sort} onClick={toggleSort} align="right" />
              <SortTh label="Avg" k="avg_duration_seconds" sort={sort} onClick={toggleSort} align="right" />
              <th className="py-2.5">Schedule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((d) => (
              <Row key={d.dag_id} dag={d} runs={runsByDag.get(d.dag_id) ?? []} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SortTh({
  label, k, sort, onClick, align = 'left',
}: { label: string; k: SortKey; sort: SortState; onClick: (k: SortKey) => void; align?: 'left' | 'right' }) {
  const active = sort.key === k
  return (
    <th className={cn('py-2.5', align === 'right' && 'text-right')}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          'inline-flex items-center gap-1 uppercase transition-colors hover:text-ink-secondary',
          active ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {label}
        {active && <span className="text-[8px] leading-none">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

function Row({ dag, runs }: { dag: DAGSummary; runs: DAGRun[] }) {
  const prefetch = usePrefetchDag(dag.dag_id)
  return (
    <tr
      data-row="dag"
      className="group data-[active=true]:bg-bg-raised/70"
    >
      <td className="py-3">
        <Link
          to={`/ui/dags/${dag.dag_id}`}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          className="flex items-center gap-2 text-[13px] text-ink transition-colors hover:text-accent"
        >
          {dag.is_running && (
            <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Running" />
          )}
          <span className="truncate">{dag.dag_id}</span>
        </Link>
      </td>
      <td className="py-3"><RunStrip runs={runs} max={20} /></td>
      <td className="py-3"><Sparkline runs={runs} max={20} /></td>
      <td className="py-3 text-right font-mono text-[11px] tabular-nums">
        <span className="text-ink">{dag.total_runs}</span>
        {dag.total_runs > 0 && (
          <span className={cn('ml-1.5', successRateClass(dag.success_rate))}>
            {formatRate(dag.success_rate)}
          </span>
        )}
      </td>
      <td className="py-3 text-right font-mono text-[11px] text-ink-secondary">
        {dag.avg_duration_seconds > 0 ? formatDuration(dag.avg_duration_seconds) : '—'}
      </td>
      <td className="py-3 font-mono text-[11px] text-ink-muted">
        {dag.schedule_display ? (
          <span>
            {dag.schedule_display}
            {dag.next_run && <> · <RelativeTime iso={dag.next_run} /></>}
          </span>
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

/* ── Editorial empty state: shown when zero DAGs are registered ── */
function EmptyDagsEditorial() {
  return (
    <div className="mx-auto max-w-2xl py-20">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
        Nothing to show
      </p>
      <h2 className="mt-3 font-display text-[28px] leading-tight text-ink">
        No pipelines yet.
      </h2>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-secondary">
        Riverflow is idle. Define a DAG in Python, register it with the scheduler, and it will
        appear here — scheduled or ready to trigger manually.
      </p>

      <pre className="mt-8 overflow-x-auto border-l-2 border-border bg-bg-raised px-5 py-4 font-mono text-[12px] leading-relaxed text-ink">
{`from riverflow import dag, task

@task
def extract():
    return [1, 2, 3]

@task
def load(xs: list[int]) -> int:
    return sum(xs)

@dag(schedule="0 * * * *")
def hourly_rollup():
    load(extract())`}
      </pre>

      <p className="mt-6 font-mono text-[11px] text-ink-muted">
        See <span className="text-ink-secondary">README.md</span> for the full reference.
      </p>
    </div>
  )
}
