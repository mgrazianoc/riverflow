/* TypeScript types mirroring the Python Pydantic models in riverflow.models */

export type TaskState =
  | 'none'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'upstream_failed'
  | 'timeout'

export type DAGRunState = 'idle' | 'scheduled' | 'running' | 'success' | 'failed'

export interface DAGSummary {
  dag_id: string
  is_running: boolean
  total_runs: number
  success_count: number
  failed_count: number
  success_rate: number
  avg_duration_seconds: number
  schedule_display: string | null
  next_run: string | null
}

export interface DAGDetail {
  dag_id: string
  description: string | null
  timezone: string
  is_running: boolean
  tasks: Task[]
  total_runs: number
  success_count: number
  failed_count: number
  success_rate: number
  avg_duration_seconds: number
  latest_run_id: string | null
  schedule_display: string | null
  next_run: string | null
}

export interface Task {
  task_id: string
  trigger_rule: string
  retries: number
  retry_delay_seconds: number
  timeout_seconds: number | null
  upstream_task_ids: string[]
}

export interface DAGRun {
  dag_id: string
  run_id: string
  state: DAGRunState
  start_time: string | null
  end_time: string | null
  task_states: Record<string, TaskState>
  error: string | null
  duration_seconds: number | null
}

export interface DAGGraph {
  dag_id: string
  is_running: boolean
  nodes: DAGNode[]
  edges: DAGEdge[]
  graph_width: number
  graph_height: number
}

export interface DAGNode {
  id: string
  label: string
  state: TaskState
  trigger_rule: string
  retries: number
  x: number
  y: number
  width: number
  height: number
}

export interface DAGEdge {
  id: string
  source: string
  target: string
}

export interface TaskLogs {
  run_id: string
  task_id: string | null
  total: number
  logs: LogEntry[]
}

export interface LogEntry {
  timestamp: string
  level: string
  task_id: string
  message: string
}

export interface Status {
  timestamp: string
  registered_dags: string[]
  running_dags: string[]
  total_history: number
  active_connections: number
}

export interface TaskTimingEntry {
  task_id: string
  start_time: string
  end_time: string
  log_count: number
}

export interface RunTiming {
  run_id: string
  tasks: TaskTimingEntry[]
}
