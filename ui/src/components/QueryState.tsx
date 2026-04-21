import { errorMessage } from '../lib/utils'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  className?: string
}

/**
 * Restrained error state — a single hairline rule, brick accent on the left,
 * no heavy coloured panel. Matches the Broadsheet aesthetic.
 */
export function ErrorState({ error, onRetry, className = 'px-8 py-10' }: ErrorStateProps) {
  return (
    <div className={className}>
      <div className="border-l-2 border-error/70 pl-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-error">Error</div>
        <p className="mt-1 text-sm text-ink-secondary">{errorMessage(error)}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 text-[12px] text-accent transition-colors hover:text-accent-hover"
          >
            Try again →
          </button>
        )}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  className = 'py-16',
}: {
  title: string
  hint?: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-sm text-ink-secondary">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

