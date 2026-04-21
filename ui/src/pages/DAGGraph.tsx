import { useMemo, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from '@xyflow/react'
import { Play, X, ExternalLink } from '../components/icons'
import { api } from '../api'
import { LogViewer } from '../components/LogViewer'
import { StateBadge } from '../components/StatusBadge'
import { cn, relativeTime } from '../lib/utils'
import type { DAGGraph, TaskState } from '../types'

/* ─── State color palette (matches our design tokens) ─────── */

const STATE_STYLES: Record<string, { border: string; bg: string; dot: string; text: string }> = {
  success:         { border: 'border-success/60',  bg: 'bg-success-muted', dot: 'bg-success',  text: 'text-success' },
  failed:          { border: 'border-error/60',    bg: 'bg-error-muted',   dot: 'bg-error',    text: 'text-error' },
  running:         { border: 'border-running/60',  bg: 'bg-running-muted', dot: 'bg-running',  text: 'text-running' },
  skipped:         { border: 'border-border-bright', bg: 'bg-bg-surface', dot: 'bg-ink-muted', text: 'text-ink-muted' },
  upstream_failed: { border: 'border-error/40',    bg: 'bg-error-muted',   dot: 'bg-error',    text: 'text-error' },
  timeout:         { border: 'border-warning/60',  bg: 'bg-warning-muted', dot: 'bg-warning',  text: 'text-warning' },
  none:            { border: 'border-border-bright', bg: 'bg-bg-raised',  dot: 'bg-ink-muted', text: 'text-ink-muted' },
}

/* ─── Custom Task Node ────────────────────────────────────── */

type TaskNodeData = {
  label: string
  state: TaskState
  triggerRule: string
  retries: number
  dagId: string
  selected?: boolean
}

function TaskNode({ data }: NodeProps<Node<TaskNodeData>>) {
  const style = STATE_STYLES[data.state] ?? STATE_STYLES.none
  const qc = useQueryClient()

  const trigger = useMutation({
    mutationFn: () => api.triggerTask(data.dagId, data.label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dag-graph', data.dagId] })
      qc.invalidateQueries({ queryKey: ['dag', data.dagId] })
    },
  })

  return (
    <>
      <Handle type="target" position={Position.Left} className="w-1.5! h-1.5! bg-border-bright! border-0!" />
      <div
        className={cn(
          'cursor-pointer rounded-lg border px-4 py-3 min-w-40 transition-all',
          'hover:shadow-md hover:shadow-black/20',
          data.selected && 'ring-2 ring-accent ring-offset-1 ring-offset-bg',
          style.border, style.bg,
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full shrink-0', style.dot)} />
          <span className="text-[13px] font-medium text-ink truncate">{data.label}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className={cn('text-[10px] font-medium uppercase tracking-wider', style.text)}>
            {data.state}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); trigger.mutate() }}
            disabled={trigger.isPending || data.state === 'running'}
            className="rounded p-0.5 text-ink-muted transition-colors hover:text-accent hover:bg-accent-muted disabled:opacity-30"
            title={`Trigger ${data.label}`}
          >
            <Play size={10} />
          </button>
        </div>
        {data.retries > 0 && (
          <div className="mt-1 text-[10px] text-ink-muted">
            {data.retries} {data.retries === 1 ? 'retry' : 'retries'}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-1.5! h-1.5! bg-border-bright! border-0!" />
    </>
  )
}

const nodeTypes = { task: TaskNode }

/* ─── Graph Page ──────────────────────────────────────────── */

export function DAGGraphTab() {
  const { dagId } = useParams<{ dagId: string }>()
  const { data: graph } = useQuery({
    queryKey: ['dag-graph', dagId],
    queryFn: () => api.getDagGraph(dagId!),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  if (!graph) return <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading graph…</div>
  if (graph.nodes.length === 0) return <div className="flex h-full items-center justify-center text-sm text-ink-muted">No tasks defined</div>

  return <FlowCanvas graph={graph} dagId={dagId!} />
}

function FlowCanvas({ graph, dagId }: { graph: DAGGraph; dagId: string }) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null)

  // Get the latest run for logs
  const { data: runs = [] } = useQuery({
    queryKey: ['history', dagId],
    queryFn: () => api.getHistory(20, dagId),
    enabled: !!dagId,
    refetchInterval: 5000,
  })

  const latestRun = runs[0] ?? null

  const { data: logs } = useQuery({
    queryKey: ['logs', latestRun?.run_id, selectedTask],
    queryFn: () => api.getRunLogs(latestRun!.run_id, selectedTask ?? undefined),
    enabled: !!latestRun && !!selectedTask,
    refetchInterval: latestRun?.state === 'running' ? 2000 : false,
  })

  const { nodes, edges } = useMemo(
    () => toReactFlow(graph, dagId, selectedTask),
    [graph, dagId, selectedTask],
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedTask((prev) => (prev === node.id ? null : node.id))
  }, [])

  const onPaneClick = useCallback(() => setSelectedTask(null), [])

  // Task history across runs
  const taskHistory = useMemo(() => {
    if (!selectedTask) return []
    return runs
      .filter((r) => selectedTask in r.task_states)
      .map((r) => ({ run: r, state: r.task_states[selectedTask] }))
  }, [runs, selectedTask])

  return (
    <div className="relative flex h-full">
      {/* Graph canvas */}
      <div className={cn('h-full transition-all duration-200', selectedTask ? 'w-[calc(100%-400px)]' : 'w-full')}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          className="bg-bg!"
        >
          <Background color="#1f2131" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="bg-bg-raised! border-border! rounded-lg! shadow-lg! shadow-black/30! [&>button]:bg-bg-raised! [&>button]:border-border! [&>button]:text-ink-muted! [&>button:hover]:bg-bg-hover! [&>button>svg]:fill-ink-muted!"
          />
          <MiniMap
            nodeColor={(n) => {
              const state = (n.data as TaskNodeData | undefined)?.state ?? 'none'
              switch (state) {
                case 'success': return '#10b981'
                case 'failed':
                case 'upstream_failed': return '#ef4444'
                case 'running': return '#3b82f6'
                case 'timeout': return '#f59e0b'
                case 'skipped': return '#6b7280'
                default: return '#9ca3af'
              }
            }}
            nodeStrokeColor="#1f2131"
            nodeStrokeWidth={2}
            maskColor="rgba(15, 17, 23, 0.6)"
            pannable
            zoomable
            className="bg-bg-raised! border! border-border! rounded-lg!"
          />
        </ReactFlow>
      </div>

      {/* Slide-out task panel */}
      {selectedTask && (
        <aside className="flex h-full w-100 shrink-0 flex-col border-l border-border bg-bg-raised">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{selectedTask}</span>
                <StateBadge state={graph.nodes.find((n) => n.id === selectedTask)?.state ?? 'none'} />
              </div>
            </div>
            {latestRun && (
              <Link
                to={`/ui/runs/${latestRun.run_id}`}
                className="mr-2 rounded p-1 text-ink-muted transition-colors hover:bg-bg-hover hover:text-ink"
                title="Open full run detail"
              >
                <ExternalLink size={13} />
              </Link>
            )}
            <button
              onClick={() => setSelectedTask(null)}
              className="rounded p-1 text-ink-muted transition-colors hover:bg-bg-hover hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>

          {/* Task history (mini) */}
          {taskHistory.length > 0 && (
            <div className="border-b border-border px-4 py-3">
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Recent runs</h4>
              <div className="mt-2 flex gap-1">
                {taskHistory.slice(0, 20).map(({ run, state }) => (
                  <Link
                    key={run.run_id}
                    to={`/ui/runs/${run.run_id}`}
                    title={`${run.run_id} — ${state} — ${relativeTime(run.start_time)}`}
                    className={cn(
                      'h-5 w-2.5 rounded-sm transition-opacity hover:opacity-80',
                      state === 'success' ? 'bg-success' :
                      state === 'failed' ? 'bg-error' :
                      state === 'running' ? 'bg-running' :
                      'bg-ink-muted/30',
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="relative flex-1 overflow-hidden">
            {!latestRun ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No runs yet</p>
            ) : (
              <LogViewer
                logs={logs?.logs ?? []}
                loading={!logs}
                streaming={latestRun.state === 'running'}
                className="h-full"
              />
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

/* ─── Transform backend graph → React Flow nodes/edges ──── */

function toReactFlow(graph: DAGGraph, dagId: string, selectedTask: string | null) {
  const nodes: Node<TaskNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'task',
    position: { x: n.x, y: n.y },
    width: 180,
    height: 72,
    data: {
      label: n.label,
      state: n.state,
      triggerRule: n.trigger_rule,
      retries: n.retries,
      dagId,
      selected: n.id === selectedTask,
    },
  }))

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: graph.is_running,
    style: { stroke: '#2c2f44', strokeWidth: 1.5 },
  }))

  return { nodes, edges }
}
