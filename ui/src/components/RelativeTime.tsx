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
  if (!iso) return <span className={className}>—</span>
  const d = new Date(iso)
  const absolute = `${d.toLocaleString()}  (${iso})`
  return (
    <time dateTime={iso} title={absolute} className={className}>
      {relativeTime(iso)}
    </time>
  )
}
