import type { DAGSummary, DAGDetail, DAGRun, DAGGraph, TaskLogs, Status, RunTiming } from './types'

const BASE = ''

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  getStatus: () => fetchJSON<Status>('/api/status'),
  getDags: () => fetchJSON<DAGSummary[]>('/api/dags'),
  getDag: (id: string) => fetchJSON<DAGDetail>(`/api/dags/${id}`),
  getDagGraph: (id: string) => fetchJSON<DAGGraph>(`/api/dags/${id}/graph`),
  getHistory: (limit = 100, dagId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (dagId) params.set('dag_id', dagId)
    return fetchJSON<DAGRun[]>(`/api/history?${params}`)
  },
  triggerDag: async (id: string) => {
    const res = await fetch(`${BASE}/api/dags/${id}/trigger`, { method: 'PUT' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json() as Promise<DAGRun>
  },
  triggerTask: async (dagId: string, taskId: string) => {
    const res = await fetch(`${BASE}/api/dags/${dagId}/tasks/${taskId}/trigger`, { method: 'PUT' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json() as Promise<DAGRun>
  },
  getRunLogs: (runId: string, taskId?: string) => {
    const params = taskId ? `?task_id=${taskId}` : ''
    return fetchJSON<TaskLogs>(`/api/runs/${runId}/logs${params}`)
  },
  getRunTiming: (runId: string) =>
    fetchJSON<RunTiming>(`/api/runs/${runId}/timing`),
}
