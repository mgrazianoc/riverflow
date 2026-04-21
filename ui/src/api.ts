import type { DAGSummary, DAGDetail, DAGRun, DAGGraph, TaskLogs, Status, RunTiming, HostMetrics } from './types'

const BASE = ''

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch { /* not JSON */ }
    throw new Error(detail)
  }
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
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json() as Promise<DAGRun>
  },
  triggerTask: async (dagId: string, taskId: string) => {
    const res = await fetch(`${BASE}/api/dags/${dagId}/tasks/${taskId}/trigger`, { method: 'PUT' })
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json() as Promise<DAGRun>
  },
  clearHistory: async (dagId: string) => {
    const res = await fetch(`${BASE}/api/dags/${dagId}/history`, { method: 'DELETE' })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json() as Promise<{ dag_id: string; cleared: number }>
  },
  getRunLogs: (runId: string, taskId?: string) => {
    const params = taskId ? `?task_id=${taskId}` : ''
    return fetchJSON<TaskLogs>(`/api/runs/${runId}/logs${params}`)
  },
  getRunTiming: (runId: string) =>
    fetchJSON<RunTiming>(`/api/runs/${runId}/timing`),
  getHostMetrics: (minutes = 60) =>
    fetchJSON<HostMetrics>(`/api/host/metrics?minutes=${minutes}`),
}
