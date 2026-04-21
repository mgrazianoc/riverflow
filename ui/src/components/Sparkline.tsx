import type { DAGRun } from '../types'

interface SparklineProps {
  runs: DAGRun[]
  /** How many most-recent completed runs to plot. Default 20. */
  max?: number
  width?: number
  height?: number
  className?: string
}

/**
 * Inline duration micro-chart — one per DAG row.
 * Bars scaled to the row's own max duration; failures tinted brick.
 * Oldest → newest, left to right.
 */
export function Sparkline({ runs, max = 20, width = 120, height = 20, className }: SparklineProps) {
  const points = [...runs]
    .filter((r) => r.duration_seconds != null)
    .slice(0, max)
    .reverse() // API is newest-first; we render oldest-first

  if (points.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--color-border)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    )
  }

  const maxDur = Math.max(...points.map((r) => r.duration_seconds!))
  const barW = Math.max(1, Math.floor(width / max) - 1)
  const gap = 1

  return (
    <svg width={width} height={height} className={className} aria-label="Recent run durations">
      {/* baseline rule */}
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--color-border)" strokeWidth={1} />
      {points.map((r, i) => {
        const h = Math.max(1, (r.duration_seconds! / maxDur) * (height - 2))
        const x = i * (barW + gap)
        const y = height - h
        const failed = r.state === 'failed'
        return (
          <rect
            key={r.run_id}
            x={x}
            y={y}
            width={barW}
            height={h}
            fill={failed ? 'var(--color-error)' : 'var(--color-ink-secondary)'}
            opacity={failed ? 0.65 : 0.55}
          />
        )
      })}
    </svg>
  )
}
