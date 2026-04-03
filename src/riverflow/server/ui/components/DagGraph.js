import { useMemo } from "react";
import { html } from "../lib/html.js";
import { buildFlow } from "../lib/graph.js";
import { nodeTypes } from "./TaskNode.js";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";

export function DagGraph({ graph, onNodeClick }) {
  const flow = useMemo(() => buildFlow(graph), [graph]);

  const handleNodeClick = (_, node) => {
    if (onNodeClick) onNodeClick(node.data);
  };

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
