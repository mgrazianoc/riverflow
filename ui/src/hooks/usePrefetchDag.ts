import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../api'

/**
 * Returns handlers that warm the query cache for a DAG's detail + graph
 * on hover/focus, so the detail page paints instantly on click.
 *
 * Usage:
 *   const prefetch = usePrefetchDag(dagId)
 *   <Link onMouseEnter={prefetch} onFocus={prefetch} …>
 */
export function usePrefetchDag(dagId: string | null | undefined): () => void {
  const qc = useQueryClient()
  return useCallback(() => {
    if (!dagId) return
    qc.prefetchQuery({
      queryKey: ['dag', dagId],
      queryFn: () => api.getDag(dagId),
      staleTime: 2000,
    })
    qc.prefetchQuery({
      queryKey: ['history', dagId, 'full'],
      queryFn: () => api.getHistory(100, dagId),
      staleTime: 2000,
    })
  }, [qc, dagId])
}
