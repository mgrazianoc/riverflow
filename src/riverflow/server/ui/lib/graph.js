export function levelByBfs(nodes, edges) {
  const incomingCount = {};
  const children = {};
  nodes.forEach((n) => {
    incomingCount[n.id] = 0;
    children[n.id] = [];
  });
  edges.forEach((e) => {
    incomingCount[e.target] += 1;
    children[e.source].push(e.target);
  });

  const queue = [];
  const level = {};
  Object.keys(incomingCount).forEach((id) => {
    if (incomingCount[id] === 0) {
      queue.push(id);
      level[id] = 0;
    }
  });

  while (queue.length) {
    const current = queue.shift();
    const currentLevel = level[current] || 0;
    children[current].forEach((child) => {
      incomingCount[child] -= 1;
      level[child] = Math.max(level[child] || 0, currentLevel + 1);
      if (incomingCount[child] === 0) queue.push(child);
    });
  }

  return level;
}

export function buildFlow(graph) {
  const levelMap = levelByBfs(graph.nodes, graph.edges);
  const byLevel = {};

  graph.nodes.forEach((node) => {
    const lvl = levelMap[node.id] || 0;
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(node);
  });

  const spacedNodes = [];
  Object.keys(byLevel)
    .map((l) => Number(l))
    .sort((a, b) => a - b)
    .forEach((lvl) => {
      const count = byLevel[lvl].length;
      byLevel[lvl].forEach((node, idx) => {
        const offsetY = idx * 120 - ((count - 1) * 120) / 2;
        spacedNodes.push({
          id: node.id,
          type: "taskNode",
          position: { x: lvl * 280, y: offsetY + 300 },
          data: {
            label: node.label || node.id,
            state: node.state,
            trigger_rule: node.trigger_rule,
            retries: node.retries,
          },
        });
      });
    });

  const flowEdges = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: graph.is_running,
    style: { stroke: "#6b8795", strokeWidth: 1.5 },
    type: "smoothstep",
  }));

  return { nodes: spacedNodes, edges: flowEdges };
}
