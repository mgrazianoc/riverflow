import { useEffect, useState } from 'react'
import { relativeTime } from '../lib/utils'

interface RelativeTimeProps {
  iso: string | null
  className?: string
}

/**
 * Renders a relative timestamp ("2m ago") with a tooltip showing
 * the absolute local time on hover for disambiguation.
 */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!iso) return
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [iso])

  if (!iso) return <span className={className}>—</span>
  const d = new Date(iso)
  const absolute = `${d.toLocaleString()}  (${iso})`
  return (
    <time dateTime={iso} title={absolute} className={className}>
      {relativeTime(iso)}
    </time>
  )
}
