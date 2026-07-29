import type {
  DAGSummary, DAGDetail, DAGRun, DAGGraph, TaskLogs, Status, RunTiming,
  HostMetrics, TriggerRunRequest, Flow, FlowRun, TriggerFlowRequest,
} from './types'

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
  getFlows: () => fetchJSON<Flow[]>('/api/flows'),
  getFlow: (id: string) => fetchJSON<Flow>(`/api/flows/${id}`),
  getFlowHistory: (limit = 100, flowId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (flowId) params.set('flow_id', flowId)
    return fetchJSON<FlowRun[]>(`/api/flow-history?${params}`)
  },
  getDag: (id: string) => fetchJSON<DAGDetail>(`/api/dags/${id}`),
  getDagGraph: (id: string) => fetchJSON<DAGGraph>(`/api/dags/${id}/graph`),
  getHistory: (limit = 100, dagId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (dagId) params.set('dag_id', dagId)
    return fetchJSON<DAGRun[]>(`/api/history?${params}`)
  },
  triggerDag: async (id: string, payload?: TriggerRunRequest) => {
    const res = await fetch(`${BASE}/api/dags/${id}/trigger`, {
      method: 'PUT',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    })
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json() as Promise<DAGRun>
  },
  triggerFlow: async (id: string, payload?: TriggerFlowRequest) => {
    const res = await fetch(`${BASE}/api/flows/${id}/trigger`, {
      method: 'PUT',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    })
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json() as Promise<FlowRun>
  },
  triggerTask: async (dagId: string, taskId: string, payload?: TriggerRunRequest) => {
    const res = await fetch(`${BASE}/api/dags/${dagId}/tasks/${taskId}/trigger`, {
      method: 'PUT',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    })
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
  clearFlowHistory: async (flowId: string) => {
    const res = await fetch(`${BASE}/api/flows/${flowId}/history`, { method: 'DELETE' })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json() as Promise<{ flow_id: string; cleared: number }>
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
