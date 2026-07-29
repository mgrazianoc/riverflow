import { useMemo, useState, useEffect, useCallback } from 'react'
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
import { useUrlState } from '../hooks/useUrlState'
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
          'h-full w-full cursor-pointer rounded-md border px-4 py-3 transition-all',
          'hover:border-ink-muted hover:shadow-sm hover:shadow-ink/10',
          data.selected && 'ring-1 ring-accent ring-offset-1 ring-offset-bg',
          style.border, style.bg,
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full shrink-0', style.dot)} />
          <span className="text-[14px] font-medium text-ink truncate">{data.label}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className={cn('text-[11px] font-medium uppercase tracking-wider', style.text)}>
            {data.state}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); trigger.mutate() }}
            disabled={trigger.isPending || data.state === 'running'}
            className="rounded-sm p-0.5 text-ink-muted transition-colors hover:bg-accent-muted hover:text-accent disabled:opacity-30"
            title={`Trigger ${data.label}`}
            aria-label={`Trigger ${data.label}`}
          >
            <Play size={10} />
          </button>
        </div>
        {data.retries > 0 && (
          <div className="mt-1 text-[11px] text-ink-muted">
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
  const isNarrow = useMediaQuery('(max-width: 639px)')
  const [selectedTask, setSelectedTask] = useUrlState<string | null>(
    'task',
    null,
    (raw) => raw || null,
    (value) => value,
  )

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
  }, [setSelectedTask])

  const onPaneClick = useCallback(() => setSelectedTask(null), [setSelectedTask])
  const selectedNode = graph.nodes.find((node) => node.id === selectedTask)
  const failedTasks = graph.nodes.filter(
    (node) => node.state === 'failed' || node.state === 'upstream_failed' || node.state === 'timeout',
  )

  // Task history across runs
  const taskHistory = useMemo(() => {
    if (!selectedTask) return []
    return runs
      .filter((r) => selectedTask in r.task_states)
      .map((r) => ({ run: r, state: r.task_states[selectedTask] }))
  }, [runs, selectedTask])

  return (
    <div className="relative flex h-full min-h-105">
      {/* Graph canvas */}
      <div className={cn('h-full w-full transition-all duration-200', selectedTask && 'lg:w-[calc(100%-400px)]')}>
        <div
          className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 border border-border bg-bg-raised/95 px-2.5 py-2 shadow-sm shadow-ink/5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted" htmlFor="graph-task-jump">
            Inspect
          </label>
          <select
            id="graph-task-jump"
            value={selectedTask ?? ''}
            onChange={(event) => setSelectedTask(event.target.value || null)}
            className="max-w-52 border-0 bg-transparent pr-1 text-[12px] text-ink outline-none sm:max-w-72"
          >
            <option value="">Choose a task…</option>
            {graph.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
          <span className="hidden border-l border-border pl-2 font-mono text-[10px] tabular-nums text-ink-muted sm:inline">
            {graph.nodes.length} tasks
          </span>
          {failedTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTask(failedTasks[0].id)}
              className="shrink-0 border-l border-border pl-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-error transition-colors hover:text-ink"
            >
              {failedTasks.length} failed →
            </button>
          )}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: isNarrow ? 0.02 : 0.18, minZoom: isNarrow ? 0.64 : 0.3, maxZoom: 1.15 }}
          minZoom={isNarrow ? 0.64 : 0.3}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          className="bg-bg!"
        >
          <Background color="var(--color-border-bright)" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="rounded-md! border-border! bg-bg-raised! shadow-sm! shadow-ink/10! [&>button]:border-border! [&>button]:bg-bg-raised! [&>button]:text-ink-muted! [&>button:hover]:bg-bg-hover! [&>button>svg]:fill-ink-muted!"
          />
          {graph.nodes.length > 12 && (
            <MiniMap
              nodeColor={(n) => {
                const state = (n.data as TaskNodeData | undefined)?.state ?? 'none'
                switch (state) {
                  case 'success': return 'var(--color-success)'
                  case 'failed':
                  case 'upstream_failed': return 'var(--color-error)'
                  case 'running': return 'var(--color-running)'
                  case 'timeout': return 'var(--color-warning)'
                  case 'skipped': return 'var(--color-ink-muted)'
                  default: return 'var(--color-border-bright)'
                }
              }}
              nodeStrokeColor="var(--color-bg)"
              nodeStrokeWidth={1}
              maskColor="var(--color-bg-surface)"
              pannable
              zoomable
              className="hidden! rounded-md! border! border-border! bg-bg-raised! sm:block!"
            />
          )}
        </ReactFlow>
      </div>

      {/* Slide-out task panel */}
      {selectedTask && (
        <aside className="absolute inset-0 z-10 flex h-full w-full shrink-0 flex-col border-l border-border bg-bg-raised sm:right-0 sm:left-auto sm:w-100 lg:static">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{selectedTask}</span>
                <StateBadge state={selectedNode?.state ?? 'none'} />
              </div>
            </div>
            {latestRun && (
              <Link
                to={`/ui/runs/${latestRun.run_id}`}
                className="mr-2 rounded-sm p-1 text-ink-muted transition-colors hover:bg-bg-hover hover:text-ink"
                title="Open full run detail"
              >
                <ExternalLink size={13} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className="rounded-sm p-1 text-ink-muted transition-colors hover:bg-bg-hover hover:text-ink"
              aria-label="Close task inspector"
            >
              <X size={14} />
            </button>
          </div>

          {selectedNode && (
            <dl className="grid grid-cols-2 gap-4 border-b border-border px-4 py-3">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  Trigger rule
                </dt>
                <dd className="mt-1 font-mono text-[12px] text-ink-secondary">
                  {selectedNode.trigger_rule}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  Retries
                </dt>
                <dd className="mt-1 font-mono text-[12px] text-ink-secondary">
                  {selectedNode.retries}
                </dd>
              </div>
            </dl>
          )}

          {/* Task history (mini) */}
          {taskHistory.length > 0 && (
            <div className="border-b border-border px-4 py-3">
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Recent runs</h4>
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

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
}

/* ─── Transform backend graph → React Flow nodes/edges ──── */

function toReactFlow(graph: DAGGraph, dagId: string, selectedTask: string | null) {
  const nodeWidth = 220
  const nodeHeight = 88
  const columnGap = 160
  const rowGap = 36
  const columns = new Map<number, typeof graph.nodes>()

  for (const graphNode of graph.nodes) {
    const column = columns.get(graphNode.x) ?? []
    column.push(graphNode)
    columns.set(graphNode.x, column)
  }

  const orderedColumns = [...columns.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, column]) => column.sort((a, b) => a.y - b.y || a.label.localeCompare(b.label)))
  const tallestColumn = Math.max(
    ...orderedColumns.map((column) => column.length * nodeHeight + (column.length - 1) * rowGap),
  )

  const positions = new Map<string, { x: number; y: number }>()
  orderedColumns.forEach((column, columnIndex) => {
    const columnHeight = column.length * nodeHeight + (column.length - 1) * rowGap
    const top = (tallestColumn - columnHeight) / 2
    column.forEach((graphNode, rowIndex) => {
      positions.set(graphNode.id, {
        x: columnIndex * (nodeWidth + columnGap),
        y: top + rowIndex * (nodeHeight + rowGap),
      })
    })
  })

  const nodes: Node<TaskNodeData>[] = graph.nodes.map((n) => {
    const position = positions.get(n.id) ?? { x: n.x, y: n.y }
    return {
      id: n.id,
      type: 'task',
      position,
      style: { width: nodeWidth, height: nodeHeight },
      data: {
        label: n.label,
        state: n.state,
        triggerRule: n.trigger_rule,
        retries: n.retries,
        dagId,
        selected: n.id === selectedTask,
      },
    }
  })

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: graph.is_running,
    style: { stroke: 'var(--color-ink-muted)', strokeWidth: 1.25 },
  }))

  return { nodes, edges }
}
