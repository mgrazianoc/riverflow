import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastCtx {
  push: (message: string, variant?: ToastVariant) => void
}

export const ToastContext = createContext<ToastCtx | null>(null)

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
