import { useMemo, useRef, useCallback } from "react";
import { html } from "../lib/html.js";
import { buildFlow } from "../lib/graph.js";
import { nodeTypes } from "./TaskNode.js";
import ReactFlow, { Background, Controls, MiniMap, useReactFlow } from "reactflow";

function FitOnTopologyChange({ topoKey }) {
  const { fitView } = useReactFlow();
  const prevKey = useRef(topoKey);
  if (prevKey.current !== topoKey) {
    prevKey.current = topoKey;
    setTimeout(() => fitView({ padding: 0.3 }), 0);
  }
  return null;
}

/** Stable topology key — changes only when node/edge ids change. */
function topoKeyOf(graph) {
  const nk = graph.nodes.map((n) => n.id).sort().join(",");
  const ek = graph.edges.map((e) => e.id).sort().join(",");
  return nk + "|" + ek;
}

export function DagGraph({ graph, onNodeClick }) {
  const topoKey = useMemo(() => topoKeyOf(graph), [graph]);
  const layoutRef = useRef({ key: null, flow: { nodes: [], edges: [] } });

  const flow = useMemo(() => {
    if (layoutRef.current.key !== topoKey) {
      // Topology changed — full layout rebuild
      layoutRef.current = { key: topoKey, flow: buildFlow(graph) };
    } else {
      // Same topology — patch only state + animated, keep positions stable
      const prev = layoutRef.current.flow;
      const stateMap = {};
      graph.nodes.forEach((n) => { stateMap[n.id] = n.state; });

      const nodes = prev.nodes.map((n) => {
        const newState = stateMap[n.id];
        return n.data.state === newState
          ? n
          : { ...n, data: { ...n.data, state: newState } };
      });

      const edges = prev.edges.map((e) =>
        e.animated === graph.is_running
          ? e
          : { ...e, animated: graph.is_running }
      );

      layoutRef.current.flow = { nodes, edges };
    }
    return layoutRef.current.flow;
  }, [graph, topoKey]);

  const handleNodeClick = useCallback(
    (_, node) => { if (onNodeClick) onNodeClick(node.data); },
    [onNodeClick],
  );

  if (flow.nodes.length === 0) {
    return html`
      <div class="graph-empty">
        <div class="graph-empty-icon">◇</div>
        <p>Select a DAG to visualize its task graph</p>
      </div>
    `;
  }

  return html`
    <${ReactFlow}
      nodes=${flow.nodes}
      edges=${flow.edges}
      nodeTypes=${nodeTypes}
      onNodeClick=${handleNodeClick}
      fitView
      fitViewOptions=${{ padding: 0.3 }}
      proOptions=${{ hideAttribution: true }}
    >
      <${FitOnTopologyChange} topoKey=${topoKey} />
      <${MiniMap}
        nodeColor=${(n) => {
          const colors = { running: "#f59e0b", success: "#22c55e", failed: "#ef4444" };
          return colors[n.data?.state] || "#cbd5e1";
        }}
        maskColor="rgba(0,0,0,0.08)"
      />
      <${Controls} showInteractive=${false} />
      <${Background} color="#e2e8f0" gap=${20} size=${1} />
    </${ReactFlow}>
  `;
}
