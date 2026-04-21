import { useCallback, useState } from 'react'
import { CheckCircle, XCircle, Info, X } from './icons'
import { cn } from '../lib/utils'
import { ToastContext, type ToastVariant } from '../hooks/useToast'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId++
    setToasts((cur) => [...cur, { id, message, variant }])
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => setToasts((c) => c.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = toast.variant === 'success' ? CheckCircle : toast.variant === 'error' ? XCircle : Info
  const tone =
    toast.variant === 'success' ? 'border-success/40 bg-success-muted text-success' :
    toast.variant === 'error' ? 'border-error/40 bg-error-muted text-error' :
    'border-border-bright bg-bg-raised text-ink-secondary'
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex min-w-65 max-w-sm items-start gap-2 rounded-md border px-3 py-2 text-xs shadow-lg shadow-ink/10 backdrop-blur',
        tone,
      )}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span className="flex-1 leading-relaxed">{toast.message}</span>
      <button
        onClick={onClose}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  )
}
