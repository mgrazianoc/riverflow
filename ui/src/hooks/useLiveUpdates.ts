import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useWebSocket } from './useWebSocket'

/** Connects to WS and invalidates React Query caches on dag_update messages */
export function useLiveUpdates() {
  const qc = useQueryClient()

  const onMessage = useCallback(
    (msg: { type: string }) => {
      if (msg.type === 'dag_update' || msg.type === 'current_runs') {
        qc.invalidateQueries({ queryKey: ['dags'] })
        qc.invalidateQueries({ queryKey: ['history'] })
        qc.invalidateQueries({ queryKey: ['status'] })
      }
    },
    [qc],
  )

  return useWebSocket(onMessage)
}
