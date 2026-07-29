import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { api } from '../api'
import { StateBadge } from '../components/StatusBadge'
import { cn, formatDuration } from '../lib/utils'
import type { Flow, FlowNode, FlowRun, TaskState } from '../types'

type FlowNodeData = {
  node: FlowNode
  state: TaskState
  runId?: string
  error?: string
}

const stateSurface: Record<string, string> = {
  success: 'border-success/60 bg-success-muted',
  failed: 'border-error/60 bg-error-muted',
  running: 'border-running/60 bg-running-muted',
  skipped: 'border-border-bright bg-bg-surface',
  upstream_failed: 'border-error/40 bg-error-muted',
  timeout: 'border-warning/60 bg-warning-muted',
  none: 'border-border-bright bg-bg-raised',
}

function DAGNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { node, state, runId, error } = data
  return (
    <>
      <Handle type="target" position={Position.Left} className="h-1.5! w-1.5! border-0! bg-border-bright!" />
      <div className={cn(
        'flex h-full w-full flex-col rounded-md border px-4 py-3 transition-colors hover:border-ink-muted',
        stateSurface[state] ?? stateSurface.none,
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-ink-muted">DAG</span>
            <Link
              to={`/ui/dags/${node.dag_id}`}
              className="mt-0.5 block truncate text-[14px] font-medium text-ink hover:text-accent"
              title={`Open DAG ${node.dag_id}`}
            >
              {node.dag_id}
            </Link>
          </div>
          <StateBadge state={state} compact />
        </div>
        <div className="mt-auto flex items-end justify-between gap-3">
          <span className="min-w-0 truncate font-mono text-[10px] text-ink-muted" title={node.node_id}>
            {node.node_id !== node.dag_id ? node.node_id : node.trigger_rule.replaceAll('_', ' ')}
          </span>
          {runId && (
            <Link
              to={`/ui/runs/${runId}`}
              className="shrink-0 font-mono text-[10px] text-ink-secondary hover:text-accent"
              title="Open child DAG run"
            >
              run →
            </Link>
          )}
        </div>
        {error && (
          <p className="mt-1 truncate font-mono text-[9px] text-error" title={error}>{error}</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="h-1.5! w-1.5! border-0! bg-border-bright!" />
    </>
  )
}

const nodeTypes = { dag: DAGNode }

export function FlowGraphTab() {
  const { flowId } = useParams<{ flowId: string }>()
  const flowQ = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => api.getFlow(flowId!),
    enabled: !!flowId,
    refetchInterval: 5000,
  })
  const runsQ = useQuery({
    queryKey: ['flow-history', flowId],
    queryFn: () => api.getFlowHistory(20, flowId),
    enabled: !!flowId,
    refetchInterval: 3000,
  })
  const flow = flowQ.data
  const latestRun = runsQ.data?.[0]

  if (!flow) {
    return <div className="flex h-full min-h-105 items-center justify-center text-sm text-ink-muted">Loading Flow…</div>
  }
  if (flow.nodes.length === 0) {
    return <div className="flex h-full min-h-105 items-center justify-center text-sm text-ink-muted">No DAGs in this Flow.</div>
  }

  return <FlowCanvas flow={flow} run={latestRun} />
}

function FlowCanvas({ flow, run }: { flow: Flow; run?: FlowRun }) {
  const { nodes, edges } = useMemo(() => toReactFlow(flow, run), [flow, run])
  const complete = run
    ? Object.values(run.node_states).filter((state) => state === 'success').length
    : 0

  return (
    <div className="relative h-full min-h-105">
      <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 border border-border bg-bg-raised/95 px-2.5 py-2 shadow-sm shadow-ink/5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted">
          Flow map
        </span>
        <span className="border-l border-border pl-2 font-mono text-[10px] text-ink-muted">
          {flow.nodes.length} {flow.nodes.length === 1 ? 'DAG' : 'DAGs'}
        </span>
        {run && (
          <>
            <StateBadge state={run.state} />
            <Link
              to={`/ui/flows/${flow.flow_id}/runs/${run.run_id}`}
              className="hidden border-l border-border pl-2 font-mono text-[10px] text-ink-secondary hover:text-accent sm:inline"
            >
              latest · {complete}/{flow.nodes.length} complete · {formatDuration(run.duration_seconds)}
            </Link>
          </>
        )}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.4, maxZoom: 1.1 }}
        minZoom={0.3}
        maxZoom={1.8}
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
        {flow.nodes.length > 8 && (
          <MiniMap
            nodeColor={(node) => {
              const state = (node.data as FlowNodeData).state
              if (state === 'success') return 'var(--color-success)'
              if (state === 'failed' || state === 'upstream_failed') return 'var(--color-error)'
              if (state === 'running') return 'var(--color-running)'
              return 'var(--color-border-bright)'
            }}
            maskColor="var(--color-bg-surface)"
            className="hidden! rounded-md! border! border-border! bg-bg-raised! sm:block!"
          />
        )}
      </ReactFlow>
    </div>
  )
}

function toReactFlow(flow: Flow, run?: FlowRun) {
  const levels = assignLevels(flow.nodes)
  const columns = new Map<number, FlowNode[]>()
  for (const node of flow.nodes) {
    const level = levels.get(node.node_id) ?? 0
    columns.set(level, [...(columns.get(level) ?? []), node])
  }

  const nodeWidth = 240
  const nodeHeight = 92
  const columnGap = 150
  const rowGap = 34
  const tallest = Math.max(...[...columns.values()].map((column) =>
    column.length * nodeHeight + Math.max(0, column.length - 1) * rowGap,
  ))

  const nodes: Node<FlowNodeData>[] = []
  for (const [level, column] of [...columns.entries()].sort(([a], [b]) => a - b)) {
    column.sort((a, b) => a.node_id.localeCompare(b.node_id))
    const height = column.length * nodeHeight + Math.max(0, column.length - 1) * rowGap
    const top = (tallest - height) / 2
    column.forEach((node, index) => {
      nodes.push({
        id: node.node_id,
        type: 'dag',
        position: {
          x: level * (nodeWidth + columnGap),
          y: top + index * (nodeHeight + rowGap),
        },
        style: { width: nodeWidth, height: nodeHeight },
        data: {
          node,
          state: run?.node_states[node.node_id] ?? 'none',
          runId: run?.dag_run_ids[node.node_id],
          error: run?.node_errors[node.node_id],
        },
      })
    })
  }

  const edges: Edge[] = flow.nodes.flatMap((node) =>
    node.upstream_node_ids.map((upstream) => ({
      id: `${upstream}->${node.node_id}`,
      source: upstream,
      target: node.node_id,
      type: 'smoothstep',
      animated: run?.state === 'running' && run.node_states[node.node_id] === 'running',
      style: { stroke: 'var(--color-ink-muted)', strokeWidth: 1.25 },
    })),
  )

  return { nodes, edges }
}

function assignLevels(nodes: FlowNode[]) {
  const levels = new Map<string, number>()
  const byId = new Map(nodes.map((node) => [node.node_id, node]))

  const visit = (id: string, visiting = new Set<string>()): number => {
    const known = levels.get(id)
    if (known != null) return known
    if (visiting.has(id)) return 0
    const node = byId.get(id)
    if (!node || node.upstream_node_ids.length === 0) {
      levels.set(id, 0)
      return 0
    }
    const nextVisiting = new Set(visiting).add(id)
    const level = Math.max(...node.upstream_node_ids.map((upstream) => visit(upstream, nextVisiting))) + 1
    levels.set(id, level)
    return level
  }

  nodes.forEach((node) => visit(node.node_id))
  return levels
}
