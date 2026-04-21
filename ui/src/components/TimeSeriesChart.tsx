/**
 * TimeSeriesChart — pure-SVG, broadsheet-language line chart.
 *
 * Handles 1–3 series plotted against a shared time axis. Designed
 * for host metrics (CPU / memory / disk / network) but generic.
 *
 * Identity:
 *  • hairline axis rules in --color-border
 *  • single accent for the primary series, earth tones for peers
 *  • mono 10px axis labels, same rhythm as ActivityChart
 *  • faint fill beneath the first series, no gradient
 */

import { useMemo, useRef } from 'react'

export interface SeriesSpec {
  label: string
  values: number[]
  /** Colour token: 'accent' | 'success' | 'warning' | 'error' | 'ink-muted' */
  color?: 'accent' | 'success' | 'warning' | 'error' | 'ink-muted'
  /** Optional dashed line (for secondary series like p95 or load average). */
  dashed?: boolean
}

export interface TimeSeriesChartProps {
  /** Unix seconds, one per sample, shared by all series. */
  timestamps: number[]
  series: SeriesSpec[]
  /** Total height in px (viewBox is 960xH). Default 180. */
  height?: number
  /** Format y-axis ticks. Default: rounded integer. */
  formatY?: (v: number) => string
  /** Format tooltip values (often same as y-axis). Falls back to `formatY`. */
  formatValue?: (v: number) => string
  /** Force y-max (otherwise derived from data). */
  yMax?: number
  /** Force y-min (otherwise 0). Default 0. */
  yMin?: number
  /** Horizontal reference line (e.g. capacity). */
  reference?: { value: number; label?: string }
  /** Shared hover index (for synchronised crosshair across charts). */
  hoverIndex?: number | null
  /** Called when the cursor moves over or leaves the plot area. */
  onHoverChange?: (i: number | null) => void
}

const colorVar: Record<NonNullable<SeriesSpec['color']>, string> = {
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  'ink-muted': 'var(--color-ink-muted)',
}

export function TimeSeriesChart({
  timestamps,
  series,
  height = 180,
  formatY,
  formatValue,
  yMax,
  yMin = 0,
  reference,
  hoverIndex = null,
  onHoverChange,
}: TimeSeriesChartProps) {
  const W = 960
  const H = height
  const PAD_L = 48
  const PAD_R = 12
  const PAD_T = 12
  const PAD_B = 22
  const IW = W - PAD_L - PAD_R
  const IH = H - PAD_T - PAD_B
  const svgRef = useRef<SVGSVGElement | null>(null)

  const n = timestamps.length
  const fmtV = formatValue ?? formatY ?? ((v: number) => Math.round(v).toString())

  const { yHi, yTicks, xTicks } = useMemo(() => {
    const allValues = series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)))
    const dataMax = allValues.length ? Math.max(...allValues) : 1
    const hi = yMax ?? niceCeil(dataMax)
    return {
      yHi: hi,
      yTicks: [0, hi / 2, hi],
      xTicks: computeXTicks(timestamps),
    }
  }, [series, timestamps, yMax])

  if (n < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          className="fill-ink-muted font-mono"
          fontSize={11}
        >
          Collecting samples…
        </text>
      </svg>
    )
  }

  const xOf = (i: number) => PAD_L + (i / (n - 1)) * IW
  const yOf = (v: number) => {
    const clamped = Math.max(yMin, Math.min(yHi, v))
    const t = (clamped - yMin) / Math.max(yHi - yMin, 1e-9)
    return PAD_T + IH - t * IH
  }

  const buildPath = (values: number[]) => {
    let d = ''
    let inSeg = false
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        inSeg = false
        return
      }
      const x = xOf(i)
      const y = yOf(v)
      d += inSeg ? `L${x.toFixed(1)} ${y.toFixed(1)} ` : `M${x.toFixed(1)} ${y.toFixed(1)} `
      inSeg = true
    })
    return d.trim()
  }

  const buildFill = (values: number[]) => {
    const d = buildPath(values)
    if (!d) return ''
    // Close to baseline for a soft area fill under the first series.
    const first = values.findIndex((v) => Number.isFinite(v))
    const last = values.length - 1 - [...values].reverse().findIndex((v) => Number.isFinite(v))
    if (first < 0 || last < 0) return ''
    return `${d} L${xOf(last).toFixed(1)} ${(PAD_T + IH).toFixed(1)} L${xOf(first).toFixed(1)} ${(PAD_T + IH).toFixed(1)} Z`
  }

  // Map a pointer event to the nearest sample index.
  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onHoverChange || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    // Map client X to viewBox X (SVG scales with `preserveAspectRatio`).
    const xView = ((e.clientX - rect.left) / rect.width) * W
    if (xView < PAD_L || xView > PAD_L + IW) {
      onHoverChange(null)
      return
    }
    const frac = (xView - PAD_L) / IW
    const i = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))))
    onHoverChange(i)
  }

  const hi = hoverIndex != null && hoverIndex >= 0 && hoverIndex < n ? hoverIndex : null

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none"
      role="img"
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={() => onHoverChange?.(null)}
    >
      {/* Y grid + ticks */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            x2={PAD_L + IW}
            y1={yOf(t)}
            y2={yOf(t)}
            stroke="var(--color-border)"
            strokeWidth={i === 0 ? 1 : 0.5}
          />
          <text
            x={PAD_L - 8}
            y={yOf(t) + 3}
            textAnchor="end"
            className="fill-ink-muted font-mono"
            fontSize={10}
          >
            {formatY ? formatY(t) : Math.round(t).toString()}
          </text>
        </g>
      ))}

      {/* X ticks */}
      {xTicks.map(({ i, label }, k) => (
        <g key={k}>
          <line
            x1={xOf(i)}
            x2={xOf(i)}
            y1={PAD_T + IH}
            y2={PAD_T + IH + 4}
            stroke="var(--color-border)"
            strokeWidth={0.5}
          />
          <text
            x={xOf(i)}
            y={PAD_T + IH + 15}
            textAnchor="middle"
            className="fill-ink-muted font-mono"
            fontSize={10}
          >
            {label}
          </text>
        </g>
      ))}

      {/* Reference line */}
      {reference && (
        <g>
          <line
            x1={PAD_L}
            x2={PAD_L + IW}
            y1={yOf(reference.value)}
            y2={yOf(reference.value)}
            stroke="var(--color-ink-muted)"
            strokeWidth={0.75}
            strokeDasharray="2 3"
          />
          {reference.label && (
            <text
              x={PAD_L + IW - 4}
              y={yOf(reference.value) - 4}
              textAnchor="end"
              className="fill-ink-muted font-mono"
              fontSize={10}
            >
              {reference.label}
            </text>
          )}
        </g>
      )}

      {/* Soft fill under primary series */}
      {series[0] && (
        <path
          d={buildFill(series[0].values)}
          fill={colorVar[series[0].color ?? 'accent']}
          opacity={0.08}
        />
      )}

      {/* Lines */}
      {series.map((s, idx) => (
        <path
          key={idx}
          d={buildPath(s.values)}
          fill="none"
          stroke={colorVar[s.color ?? (idx === 0 ? 'accent' : 'ink-muted')]}
          strokeWidth={idx === 0 ? 1.5 : 1}
          strokeDasharray={s.dashed ? '3 3' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Crosshair + tooltip at shared hover index */}
      {hi != null &&
        (() => {
          const hx = xOf(hi)
          const ts = timestamps[hi]
          const d = new Date(ts * 1000)
          const hhmmss = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`

          // Tooltip geometry (in viewBox units).
          const TIP_W = 170
          const LINE_H = 14
          const tipLines = series.length + 1 // 1 header + n series
          const TIP_H = 10 + tipLines * LINE_H
          // Flip to the left side if we'd overflow the plot.
          const flip = hx + 12 + TIP_W > PAD_L + IW
          const tipX = flip ? hx - 12 - TIP_W : hx + 12
          const tipY = PAD_T + 4

          return (
            <g pointerEvents="none">
              <line
                x1={hx}
                x2={hx}
                y1={PAD_T}
                y2={PAD_T + IH}
                stroke="var(--color-ink-muted)"
                strokeWidth={0.75}
                strokeDasharray="2 3"
              />
              {series.map((s, idx) => {
                const v = s.values[hi]
                if (!Number.isFinite(v)) return null
                return (
                  <circle
                    key={idx}
                    cx={hx}
                    cy={yOf(v)}
                    r={3}
                    fill="var(--color-bg)"
                    stroke={colorVar[s.color ?? (idx === 0 ? 'accent' : 'ink-muted')]}
                    strokeWidth={1.25}
                  />
                )
              })}

              {/* Tooltip */}
              <rect
                x={tipX}
                y={tipY}
                width={TIP_W}
                height={TIP_H}
                fill="var(--color-bg-raised)"
                stroke="var(--color-border)"
                strokeWidth={0.75}
              />
              <text
                x={tipX + 8}
                y={tipY + 14}
                className="fill-ink-muted font-mono"
                fontSize={10}
              >
                {hhmmss}
              </text>
              {series.map((s, idx) => {
                const v = s.values[hi]
                const y = tipY + 14 + (idx + 1) * LINE_H
                const stroke = colorVar[s.color ?? (idx === 0 ? 'accent' : 'ink-muted')]
                return (
                  <g key={idx}>
                    <line
                      x1={tipX + 8}
                      x2={tipX + 20}
                      y1={y - 3}
                      y2={y - 3}
                      stroke={stroke}
                      strokeWidth={1.5}
                      strokeDasharray={s.dashed ? '3 3' : undefined}
                    />
                    <text
                      x={tipX + 26}
                      y={y}
                      className="fill-ink-secondary font-mono"
                      fontSize={10}
                    >
                      {s.label}
                    </text>
                    <text
                      x={tipX + TIP_W - 8}
                      y={y}
                      textAnchor="end"
                      className="fill-ink font-mono"
                      fontSize={10}
                    >
                      {Number.isFinite(v) ? fmtV(v) : '—'}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })()}
    </svg>
  )
}

/* ── Helpers ──────────────────────────────────────────── */

function niceCeil(x: number): number {
  if (x <= 0) return 1
  const exp = Math.floor(Math.log10(x))
  const base = Math.pow(10, exp)
  const frac = x / base
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * base
}

function computeXTicks(timestamps: number[]): { i: number; label: string }[] {
  const n = timestamps.length
  if (n < 2) return []
  const ticks = Math.min(5, n)
  const step = (n - 1) / (ticks - 1)
  const out: { i: number; label: string }[] = []
  for (let k = 0; k < ticks; k++) {
    const i = Math.round(k * step)
    const d = new Date(timestamps[i] * 1000)
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    out.push({ i, label: `${hh}:${mm}` })
  }
  return out
}
