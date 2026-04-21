import { useMemo } from 'react'
import type { DAGRun } from '../types'

interface ActivityChartProps {
  runs: DAGRun[]
  /** Number of daily buckets, newest-last. Default 14. */
  days?: number
  className?: string
}

interface Bucket {
  date: Date
  /** 0–1 (ratio of successful runs). null when there are no runs that day. */
  successRate: number | null
  /** p95 duration in seconds. null when there were no completed runs. */
  p95Duration: number | null
  /** failure count */
  failures: number
  /** total runs that day */
  total: number
}

/**
 * The Dashboard hero — a single layered chart that replaces every KPI card.
 *
 *   success-rate area (accent, 0–100%)       ← primary, carries the eye
 *   p95 duration line (ink-secondary)        ← secondary narrative
 *   failure bars      (error, stem from x)   ← anomaly marker
 *
 * Pure SVG, no chart library. ~200 lines, zero runtime dependencies.
 */
export function ActivityChart({ runs, days = 14, className }: ActivityChartProps) {
  const buckets = useMemo(() => bucketize(runs, days), [runs, days])

  // Layout — 16:5, generous left margin for y-axis numerals
  const W = 960
  const H = 300
  const padL = 44
  const padR = 52   // room for right-side p95 axis
  const padT = 16
  const padB = 32
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const n = buckets.length
  const xFor = (i: number) => padL + (innerW * (i + 0.5)) / n

  // Success-rate area (0..1 → top..bottom)
  const yRate = (r: number) => padT + innerH * (1 - r)

  // Duration scale (seconds, log-ish dynamic max). p95 line.
  const maxDur = Math.max(1, ...buckets.map((b) => b.p95Duration ?? 0))
  const yDur = (d: number) => padT + innerH * (1 - d / maxDur)

  // Failure bars — stem from baseline, scaled by max failure count in window
  const maxFail = Math.max(1, ...buckets.map((b) => b.failures))
  const failHeight = (f: number) => (innerH * 0.35 * f) / maxFail

  // Area path for success rate, with gap handling for empty buckets
  const areaSegments = buildAreaSegments(buckets, xFor, yRate, padT + innerH)
  const lineSegments = buildLineSegments(buckets, xFor, yDur)

  // Are there any runs at all?
  const hasData = buckets.some((b) => b.total > 0)

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block"
        role="img"
        aria-label="Run activity over time"
        preserveAspectRatio="none"
      >
        {/* Grid — hairline rules at 0 / 50 / 100% success */}
        {[0, 0.5, 1].map((v) => (
          <line
            key={v}
            x1={padL}
            x2={W - padR}
            y1={yRate(v)}
            y2={yRate(v)}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray={v === 0 || v === 1 ? undefined : '2 3'}
          />
        ))}

        {/* Failure bars — drawn behind the area so the eye can still track the rate */}
        {buckets.map((b, i) =>
          b.failures > 0 ? (
            <rect
              key={`fail-${i}`}
              x={xFor(i) - 3}
              y={padT + innerH - failHeight(b.failures)}
              width={6}
              height={failHeight(b.failures)}
              fill="var(--color-error)"
              opacity={0.22}
            />
          ) : null,
        )}

        {/* Success-rate area */}
        {areaSegments.map((seg, i) => (
          <path
            key={`area-${i}`}
            d={seg.area}
            fill="var(--color-accent)"
            opacity={0.10}
          />
        ))}
        {areaSegments.map((seg, i) => (
          <path
            key={`line-${i}`}
            d={seg.line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* p95 duration line — dashed ink-secondary */}
        {lineSegments.map((d, i) => (
          <path
            key={`dur-${i}`}
            d={d}
            fill="none"
            stroke="var(--color-ink-secondary)"
            strokeWidth={1.1}
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        ))}

        {/* Dots on days with data, for the success series */}
        {buckets.map((b, i) =>
          b.successRate != null ? (
            <circle
              key={`dot-${i}`}
              cx={xFor(i)}
              cy={yRate(b.successRate)}
              r={2}
              fill="var(--color-bg)"
              stroke="var(--color-accent)"
              strokeWidth={1.2}
            />
          ) : null,
        )}

        {/* Left axis — success rate */}
        <g className="font-mono" fontSize={9} fill="var(--color-ink-muted)">
          <text x={padL - 8} y={yRate(1) + 3} textAnchor="end">100</text>
          <text x={padL - 8} y={yRate(0.5) + 3} textAnchor="end">50</text>
          <text x={padL - 8} y={yRate(0) + 3} textAnchor="end">0</text>
        </g>

        {/* Right axis — p95 duration max */}
        <g className="font-mono" fontSize={9} fill="var(--color-ink-muted)">
          <text x={W - padR + 8} y={padT + 3} textAnchor="start">{formatDurCompact(maxDur)}</text>
          <text x={W - padR + 8} y={padT + innerH + 3} textAnchor="start">0s</text>
        </g>

        {/* Bottom axis — date ticks */}
        <g className="font-mono" fontSize={9} fill="var(--color-ink-muted)">
          {buckets.map((b, i) =>
            i === 0 || i === buckets.length - 1 || i === Math.floor(buckets.length / 2) ? (
              <text key={i} x={xFor(i)} y={H - padB + 16} textAnchor="middle">
                {formatDayLabel(b.date)}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {/* Legend — minimal, below, editorial rhythm */}
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-ink-muted">
        <LegendSwatch kind="area" />
        <span>Success rate</span>
        <LegendSwatch kind="dash" />
        <span>p95 duration</span>
        <LegendSwatch kind="bar" />
        <span>Failures</span>
        <span className="ml-auto">
          {hasData ? `${sum(buckets, (b) => b.total)} runs · ${days} days` : `No activity in ${days} days`}
        </span>
      </figcaption>
    </figure>
  )
}

/* ─── internals ─────────────────────────────────────────────────── */

function bucketize(runs: DAGRun[], days: number): Bucket[] {
  const buckets: Bucket[] = []
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(todayStart)
    date.setDate(todayStart.getDate() - i)
    buckets.push({ date, successRate: null, p95Duration: null, failures: 0, total: 0 })
  }

  const oldestMs = buckets[0].date.getTime()

  // Group runs by day index
  const byDay = new Map<number, DAGRun[]>()
  for (const r of runs) {
    if (!r.start_time) continue
    const t = new Date(r.start_time).getTime()
    if (t < oldestMs) continue
    const d = new Date(r.start_time)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const idx = buckets.findIndex((b) => b.date.getTime() === dayStart)
    if (idx < 0) continue
    const arr = byDay.get(idx) ?? []
    arr.push(r)
    byDay.set(idx, arr)
  }

  for (const [idx, dayRuns] of byDay) {
    const total = dayRuns.length
    const successes = dayRuns.filter((r) => r.state === 'success').length
    const failures = dayRuns.filter((r) => r.state === 'failed').length
    const completed = dayRuns.filter((r) => r.duration_seconds != null)
    const durs = completed.map((r) => r.duration_seconds!).sort((a, b) => a - b)
    const p95 = durs.length ? durs[Math.floor(durs.length * 0.95)] ?? durs[durs.length - 1] : null

    buckets[idx] = {
      ...buckets[idx],
      total,
      failures,
      successRate: successes + failures > 0 ? successes / (successes + failures) : null,
      p95Duration: p95,
    }
  }

  return buckets
}

function buildAreaSegments(
  buckets: Bucket[],
  xFor: (i: number) => number,
  yFor: (r: number) => number,
  baseline: number,
): { area: string; line: string }[] {
  const segs: { area: string; line: string }[] = []
  let cur: { i: number; r: number }[] = []

  const flush = () => {
    if (cur.length === 0) return
    const pts = cur.map((p) => `${xFor(p.i)},${yFor(p.r)}`).join(' L ')
    const first = cur[0]
    const last = cur[cur.length - 1]
    segs.push({
      area: `M ${xFor(first.i)},${baseline} L ${pts} L ${xFor(last.i)},${baseline} Z`,
      line: `M ${pts}`,
    })
    cur = []
  }

  buckets.forEach((b, i) => {
    if (b.successRate != null) cur.push({ i, r: b.successRate })
    else flush()
  })
  flush()
  return segs
}

function buildLineSegments(
  buckets: Bucket[],
  xFor: (i: number) => number,
  yFor: (d: number) => number,
): string[] {
  const segs: string[] = []
  let cur: { i: number; d: number }[] = []
  const flush = () => {
    if (cur.length < 2) { cur = []; return }
    segs.push('M ' + cur.map((p) => `${xFor(p.i)},${yFor(p.d)}`).join(' L '))
    cur = []
  }
  buckets.forEach((b, i) => {
    if (b.p95Duration != null) cur.push({ i, d: b.p95Duration })
    else flush()
  })
  flush()
  return segs
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDurCompact(s: number): string {
  if (s < 1) return `${Math.round(s * 1000)}ms`
  if (s < 60) return `${s.toFixed(0)}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  let s = 0
  for (const x of arr) s += f(x)
  return s
}

function LegendSwatch({ kind }: { kind: 'area' | 'dash' | 'bar' }) {
  if (kind === 'area') {
    return (
      <svg width={18} height={10} aria-hidden>
        <rect width={18} height={10} fill="var(--color-accent)" opacity={0.15} />
        <line x1={0} x2={18} y1={2} y2={2} stroke="var(--color-accent)" strokeWidth={1.5} />
      </svg>
    )
  }
  if (kind === 'dash') {
    return (
      <svg width={18} height={10} aria-hidden>
        <line x1={0} x2={18} y1={5} y2={5} stroke="var(--color-ink-secondary)" strokeWidth={1.1} strokeDasharray="3 3" />
      </svg>
    )
  }
  return (
    <svg width={18} height={10} aria-hidden>
      <rect x={5} y={2} width={3} height={8} fill="var(--color-error)" opacity={0.55} />
      <rect x={11} y={5} width={3} height={5} fill="var(--color-error)" opacity={0.55} />
    </svg>
  )
}
