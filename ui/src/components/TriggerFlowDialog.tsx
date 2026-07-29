import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { cn } from '../lib/utils'
import type { Flow, TriggerFlowRequest } from '../types'

type StandardMode = 'incremental' | 'backfill' | 'full_refresh'
type Mode = StandardMode | 'custom'

type TriggerFlowDialogProps = {
  flow: Flow
  open: boolean
  pending?: boolean
  onClose: () => void
  onSubmit: (payload: TriggerFlowRequest) => void
}

const MODES: Array<{
  value: Mode
  label: string
  hint: string
}> = [
  { value: 'incremental', label: 'Incremental', hint: 'Process new and recently changed data.' },
  { value: 'backfill', label: 'Backfill', hint: 'Process one explicit historical interval.' },
  { value: 'full_refresh', label: 'Full refresh', hint: 'Rebuild the complete available dataset.' },
  { value: 'custom', label: 'Custom', hint: 'Pass an application-defined trigger mode.' },
]

const RESERVED_KEYS = new Set(['run_mode', 'requested_start', 'requested_end'])

export function TriggerFlowDialog({
  flow,
  open,
  pending = false,
  onClose,
  onSubmit,
}: TriggerFlowDialogProps) {
  const [mode, setMode] = useState<Mode>('incremental')
  const [customMode, setCustomMode] = useState('')
  const [requestedStart, setRequestedStart] = useState('')
  const [requestedEnd, setRequestedEnd] = useState('')
  const [force, setForce] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(flow.is_running)
  const [parametersText, setParametersText] = useState('{\n  \n}')
  const [requestedBy, setRequestedBy] = useLocalStorage('riverflow:trigger:requested-by', '')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const prior = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => dialog?.querySelector<HTMLElement>('button')?.focus())
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      prior?.focus()
    }
  }, [open, pending])

  const effectiveMode = mode === 'custom' ? customMode.trim() : mode
  const actionLabel = useMemo(() => {
    if (pending) return 'Starting…'
    if (flow.is_running && force) return 'Start concurrent run'
    if (mode === 'backfill') return 'Start backfill'
    if (mode === 'full_refresh') return 'Start full refresh'
    return 'Trigger Flow'
  }, [flow.is_running, force, mode, pending])

  if (!open) return null

  const submit = () => {
    if (!effectiveMode) {
      setError('Enter a custom trigger mode.')
      return
    }
    if (mode === 'backfill' && !requestedStart) {
      setError('Backfill requires a start date.')
      return
    }
    if (requestedStart && requestedEnd && requestedEnd < requestedStart) {
      setError('End date must be on or after the start date.')
      return
    }

    let extra: Record<string, unknown> = {}
    const trimmed = parametersText.trim()
    if (trimmed && trimmed !== '{}') {
      try {
        const parsed: unknown = JSON.parse(trimmed)
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
          setError('Additional parameters must be a JSON object.')
          return
        }
        extra = parsed as Record<string, unknown>
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : 'Invalid parameter JSON.')
        return
      }
    }

    const conflict = Object.keys(extra).find((key) => RESERVED_KEYS.has(key))
    if (conflict) {
      setError(`“${conflict}” is controlled by the run-mode fields above. Remove it from additional parameters.`)
      return
    }

    const parameters: Record<string, unknown> = { ...extra }
    if (mode !== 'custom') parameters.run_mode = mode
    if (mode === 'backfill') {
      parameters.requested_start = requestedStart
      if (requestedEnd) parameters.requested_end = requestedEnd
    }

    setError(null)
    onSubmit({
      parameters,
      trigger_source: 'ui',
      trigger_mode: effectiveMode,
      requested_by: requestedBy.trim() || null,
      force,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg/85 px-3 py-4 sm:px-4 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trigger-flow-title"
      aria-describedby="trigger-flow-description"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose()
      }}
    >
      <div ref={dialogRef} className="mx-auto w-full max-w-3xl border border-ink bg-bg-raised">
        <div className="flex items-start justify-between gap-5 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              Trigger Flow
            </div>
            <h2
              id="trigger-flow-title"
              className="mt-1.5 truncate font-display text-[26px] font-normal leading-[1.1] tracking-[-0.015em] text-ink"
            >
              {flow.flow_id}
            </h2>
            <p id="trigger-flow-description" className="mt-1 text-[13px] text-ink-muted">
              Parameters propagate to {flow.nodes.length} {flow.nodes.length === 1 ? 'child DAG' : 'child DAGs'}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="shrink-0 px-1 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted hover:text-ink disabled:opacity-40"
            aria-label="Close trigger dialog"
          >
            Esc · Close
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="space-y-5 px-4 py-5 sm:px-5">
            {flow.is_running && (
              <div className="border-l-2 border-warning pl-4 text-[12px] leading-5 text-ink-secondary">
                This Flow is already running. Starting another run requires the concurrency override
                under Advanced; review the child DAG policies first.
              </div>
            )}

            <fieldset>
              <legend className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                Acquisition mode
              </legend>
              <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                {MODES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'cursor-pointer bg-bg px-3 py-2.5 transition-colors',
                      mode === option.value ? 'bg-bg-surface' : 'hover:bg-bg-hover',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="flow-mode"
                        value={option.value}
                        checked={mode === option.value}
                        onChange={() => {
                          setMode(option.value)
                          setError(null)
                        }}
                        className="size-3 accent-(--color-ink)"
                      />
                      <span className="text-[14px] font-medium text-ink">{option.label}</span>
                    </span>
                    <span className="mt-1 block pl-5 text-[12px] leading-4 text-ink-muted">{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === 'backfill' && (
              <section className="border-l-2 border-warning pl-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label>
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                      Start date · required
                    </span>
                    <input
                      type="date"
                      value={requestedStart}
                      onChange={(event) => {
                        setRequestedStart(event.target.value)
                        setError(null)
                      }}
                      className="mt-1 w-full border border-border bg-bg px-2 py-1.5 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
                    />
                  </label>
                  <label>
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                      End date · optional
                    </span>
                    <input
                      type="date"
                      min={requestedStart || undefined}
                      value={requestedEnd}
                      onChange={(event) => {
                        setRequestedEnd(event.target.value)
                        setError(null)
                      }}
                      className="mt-1 w-full border border-border bg-bg px-2 py-1.5 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[12px] leading-4 text-ink-muted">
                  Dates are inclusive. An omitted end lets the workflow choose its current boundary.
                </p>
              </section>
            )}

            {mode === 'full_refresh' && (
              <div className="border-l-2 border-warning pl-4 text-[12px] leading-5 text-ink-secondary">
                Full refresh may replace complete outputs. Confirm that every child DAG supports this mode.
              </div>
            )}

            {mode === 'custom' && (
              <label className="block">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                  Custom trigger mode
                </span>
                <input
                  value={customMode}
                  onChange={(event) => {
                    setCustomMode(event.target.value)
                    setError(null)
                  }}
                  placeholder="application-defined mode"
                  className="mt-1 w-full border border-border bg-bg px-2 py-1.5 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
                />
              </label>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label>
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                  Requested by
                </span>
                <input
                  value={requestedBy}
                  onChange={(event) => setRequestedBy(event.target.value)}
                  placeholder="operator or system"
                  autoComplete="off"
                  className="mt-1 w-full border border-border bg-bg px-2 py-1.5 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-ink-muted">Remembered on this device.</span>
              </label>
              <div>
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                  Run summary
                </span>
                <div className="mt-1 border-y border-border py-1.5 font-mono text-[11px] leading-5 text-ink-secondary">
                  {flow.nodes.length} {flow.nodes.length === 1 ? 'DAG' : 'DAGs'} · {effectiveMode || 'mode required'}
                  {mode === 'backfill' && requestedStart && (
                    <span className="block text-ink-muted">
                      {requestedStart} → {requestedEnd || 'workflow boundary'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <section className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setAdvancedOpen((value) => !value)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={advancedOpen}
              >
                <span>
                  <span className="block font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                    Advanced
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    Additional JSON parameters and concurrency override
                  </span>
                </span>
                <span className="font-mono text-[12px] text-ink-muted">{advancedOpen ? '−' : '+'}</span>
              </button>

              {advancedOpen && (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                      Additional parameters · JSON object
                    </span>
                    <textarea
                      value={parametersText}
                      onChange={(event) => {
                        setParametersText(event.target.value)
                        setError(null)
                      }}
                      rows={6}
                      spellCheck={false}
                      className="mt-1 w-full resize-y border border-border bg-bg px-3 py-2 font-mono text-[13px] leading-5 text-ink focus:border-ink focus:outline-none"
                    />
                    <span className="mt-1 block text-[11px] text-ink-muted">
                      Use for application-specific values. Mode and date keys are managed above.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 border-l-2 border-error pl-3 text-[12px] text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(event) => setForce(event.target.checked)}
                      className="mt-0.5 size-3 accent-(--color-error)"
                    />
                    <span>
                      <span className="block font-medium text-error">Force concurrent Flow run</span>
                      <span className="mt-0.5 block text-ink-muted">
                        Bypass the Flow-level running guard. Child DAG concurrency policies still apply.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </section>

            {error && (
              <div role="alert" className="border-l-2 border-error pl-3 font-mono text-[12px] leading-5 text-error">
                {error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
            <span className="font-mono text-[10px] text-ink-muted">
              {flow.is_running && !force
                ? 'Enable force to run concurrently'
                : effectiveMode
                  ? `trigger_mode=${effectiveMode}`
                  : 'Choose a valid mode'}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="text-[13px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !effectiveMode || (flow.is_running && !force)}
                className="border border-ink bg-ink px-3 py-1.5 text-[13px] font-medium text-bg transition-colors hover:border-accent hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                {actionLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
