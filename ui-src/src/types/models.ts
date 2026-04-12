/**
 * Pydantic-mirrored types — the TypeScript side of the red line.
 *
 * These MUST match the Pydantic models in `riverflow.models`.
 * Auto-generation via `npm run generate-types` replaces this file
 * with types derived from the live OpenAPI schema.
 */

export type TaskState =
  | "none"
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "upstream_failed"
  | "timeout";

export type TriggerRule =
  | "all_success"
  | "all_failed"
  | "all_done"
  | "all_done_min_one_success"
  | "all_skipped"
  | "one_success"
  | "one_failed"
  | "one_done"
  | "none_failed"
  | "none_failed_min_one_success"
  | "none_skipped"
  | "always";

export type DAGRunState =
  | "idle"
  | "scheduled"
  | "running"
  | "success"
  | "failed";

export interface TaskModel {
  task_id: string;
  trigger_rule: TriggerRule;
  retries: number;
  retry_delay_seconds: number;
  timeout_seconds: number | null;
  upstream_task_ids: string[];
}

export interface DAGSummaryModel {
  dag_id: string;
  is_running: boolean;
  total_runs: number;
  success_count: number;
  failed_count: number;
  success_rate: number;
  avg_duration_seconds: number;
}

export interface DAGRunModel {
  dag_id: string;
  run_id: string;
  state: DAGRunState;
  start_time: string | null;
  end_time: string | null;
  task_states: Record<string, TaskState>;
  error: string | null;
  duration_seconds: number | null;
}

export interface DAGNodeModel {
  id: string;
  label: string;
  state: TaskState;
  trigger_rule: TriggerRule;
  retries: number;
}

export interface DAGEdgeModel {
  id: string;
  source: string;
  target: string;
}

export interface DAGGraphModel {
  dag_id: string;
  is_running: boolean;
  run_id: string | null;
  nodes: DAGNodeModel[];
  edges: DAGEdgeModel[];
  timestamp: string;
}

export interface WSMessage {
  type: "connected" | "dag_update" | "history" | "current_runs" | "pong" | "status" | "dag_stats";
  timestamp: string;
  data?: DAGRunModel | Record<string, unknown>;
  message?: string;
}
