import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import type { DAGRun, DAGSummary, DAGDetail } from '../types'

/**
 * Connects to /ws and applies targeted React Query cache updates so the UI
 * reflects engine activity without full refetch storms.
 */
export function useLiveUpdates() {
  const qc = useQueryClient()

  const upsertRunInHistories = useCallback((run: DAGRun) => {
    qc.setQueriesData<DAGRun[] | undefined>({ queryKey: ['history'] }, (prev) => {
      if (!prev) return prev
      // Leave dag-scoped caches for other DAGs untouched.
      if (prev.length > 0) {
        const dagIds = new Set(prev.map((r) => r.dag_id))
        if (dagIds.size === 1 && !dagIds.has(run.dag_id)) return prev
      }
      const idx = prev.findIndex((r) => r.run_id === run.run_id)
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = run
        return next
      }
      return [run, ...prev]
    })
  }, [qc])

  const updateDagRunningFlag = useCallback((dagId: string, isRunning: boolean) => {
    qc.setQueryData<DAGSummary[] | undefined>(['dags'], (prev) =>
      prev?.map((d) => (d.dag_id === dagId ? { ...d, is_running: isRunning } : d)),
    )
    const detailKey: QueryKey = ['dag', dagId]
    qc.setQueryData<DAGDetail | undefined>(detailKey, (prev) =>
      prev ? { ...prev, is_running: isRunning } : prev,
    )
  }, [qc])

  const onMessage = useCallback(
    (msg: { type: string; data?: unknown }) => {
      if (msg.type === 'dag_update' && msg.data) {
        const run = msg.data as DAGRun
        upsertRunInHistories(run)
        updateDagRunningFlag(run.dag_id, run.state === 'running')
        qc.invalidateQueries({ queryKey: ['dag-graph', run.dag_id] })
        if (run.state !== 'running') {
          // Stats (success_rate, totals) need a fresh read on terminal states.
          qc.invalidateQueries({ queryKey: ['dag', run.dag_id] })
          qc.invalidateQueries({ queryKey: ['dags'] })
        }
      } else if (msg.type === 'current_runs') {
        // Initial sync after (re)connect.
        qc.invalidateQueries({ queryKey: ['dags'] })
        qc.invalidateQueries({ queryKey: ['history'] })
      }
    },
    [qc, upsertRunInHistories, updateDagRunningFlag],
  )

  return useWebSocket(onMessage)
}
