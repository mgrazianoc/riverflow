import { useEffect, useRef, useState } from 'react'
import type { TriggerRunRequest } from '../types'

type TriggerRunDialogProps = {
  dagId: string
  open: boolean
  pending?: boolean
  onClose: () => void
  onSubmit: (payload: TriggerRunRequest) => void
}

const PRESETS = [
  { label: 'Default', value: '', hint: 'No run_mode metadata' },
  { label: 'Incremental', value: 'incremental', hint: 'Watermarks and lookbacks' },
  { label: 'Backfill', value: 'backfill', hint: 'Full historical policy' },
]

export function TriggerRunDialog({ dagId, open, pending, onClose, onSubmit }: TriggerRunDialogProps) {
  const [runMode, setRunMode] = useState('')
  const [triggerMode, setTriggerMode] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [force, setForce] = useState(false)
  const [metadataText, setMetadataText] = useState('{\n  \n}')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const prior = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('button, input, textarea')?.focus()
    })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      prior?.focus()
    }
  }, [open, pending])

  if (!open) return null

  const submit = () => {
    let metadata: Record<string, unknown> = {}
    const trimmed = metadataText.trim()
    if (trimmed && trimmed !== '{}') {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
          setError('Metadata must be a JSON object.')
          return
        }
        metadata = parsed
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid metadata JSON.')
        return
      }
    }

    if (runMode) metadata.run_mode = runMode
    setError(null)
    onSubmit({
      metadata,
      trigger_mode: triggerMode.trim() || null,
      requested_by: requestedBy.trim() || null,
      force,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg/80 px-3 py-6 sm:px-4 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trigger-run-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose()
      }}
    >
      <div ref={dialogRef} className="mx-auto w-full max-w-2xl border border-ink bg-bg-raised">
        <div className="border-b border-border px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">Trigger run</div>
          <h2 id="trigger-run-title" className="mt-2 font-display text-[28px] font-light leading-[1.05] tracking-[-0.015em] text-ink">
            {dagId}
          </h2>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section>
            <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Run mode metadata
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => setRunMode(preset.value)}
                  className={[
                    'border px-3 py-2 text-left transition-colors',
                    runMode === preset.value
                      ? 'border-ink bg-bg-surface text-ink'
                      : 'border-border text-ink-secondary hover:border-ink',
                  ].join(' ')}
                >
                  <div className="text-[13px]">{preset.label}</div>
                  <div className="mt-1 font-mono text-[10px] text-ink-muted">{preset.hint}</div>
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                Trigger mode
              </span>
              <input
                value={triggerMode}
                onChange={(e) => setTriggerMode(e.target.value)}
                placeholder="manual, queue, debug..."
                className="mt-1 w-full border border-border bg-bg px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                Requested by
              </span>
              <input
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="operator or system"
                className="mt-1 w-full border border-border bg-bg px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 font-mono text-[11px] text-ink-secondary">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="accent-ink"
            />
            Force concurrent run
          </label>

          <label className="block">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Metadata JSON
            </span>
            <textarea
              value={metadataText}
              onChange={(e) => setMetadataText(e.target.value)}
              rows={7}
              spellCheck={false}
              className="mt-1 w-full resize-y border border-border bg-bg px-3 py-2 font-mono text-[12px] leading-5 text-ink focus:border-ink focus:outline-none"
            />
          </label>

          {error && <div className="border-l-2 border-error pl-3 font-mono text-[11px] text-error">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="border border-ink bg-ink px-3 py-1.5 text-[12px] font-medium text-bg transition-colors hover:border-accent hover:bg-accent disabled:opacity-50"
          >
            Trigger
          </button>
        </div>
      </div>
    </div>
  )
}
