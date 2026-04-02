const { useEffect, useMemo, useState, useCallback } = React;
const {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
} = window.ReactFlow;

function dagStateClass(state) {
  if (!state || state === "none") return "none";
  if (state === "running") return "running";
  if (state === "success") return "success";
  return "failed";
}

function TaskNode({ data }) {
  return (
    <div className={`rf-node ${data.state}`}>
      <Handle type="target" position={Position.Top} />
      <div className="name">{data.label}</div>
      <div className="sub">state: {data.state}</div>
      <div className="sub">rule: {data.trigger_rule}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { taskNode: TaskNode };

function levelByBfs(nodes, edges) {
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

function buildFlow(graph) {
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
      byLevel[lvl].forEach((node, idx) => {
        spacedNodes.push({
          id: node.id,
          type: "taskNode",
          position: { x: lvl * 260, y: idx * 140 },
          data: {
            label: node.label,
            state: node.state,
            trigger_rule: node.trigger_rule,
          },
        });
      });
    });

  const flowEdges = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: graph.is_running,
    style: { stroke: "#6b8795", strokeWidth: 1.7 },
  }));

  return { nodes: spacedNodes, edges: flowEdges };
}

function App() {
  const [dags, setDags] = useState([]);
  const [selectedDag, setSelectedDag] = useState("");
  const [graph, setGraph] = useState({ nodes: [], edges: [], is_running: false });
  const [wsOnline, setWsOnline] = useState(false);

  const refreshDags = useCallback(async () => {
    const response = await fetch("/api/dags");
    const payload = await response.json();
    const dagItems = payload.dags || [];
    setDags(dagItems);
    if (!selectedDag && dagItems.length > 0) {
      setSelectedDag(dagItems[0].dag_id);
    }
  }, [selectedDag]);

  const refreshGraph = useCallback(async (dagId) => {
    if (!dagId) return;
    const response = await fetch(`/api/dags/${dagId}/graph`);
    if (!response.ok) return;
    const payload = await response.json();
    setGraph(payload);
  }, []);

  useEffect(() => {
    refreshDags();
  }, [refreshDags]);

  useEffect(() => {
    refreshGraph(selectedDag);
  }, [selectedDag, refreshGraph]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.addEventListener("open", () => setWsOnline(true));
    socket.addEventListener("close", () => setWsOnline(false));
    socket.addEventListener("message", async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "dag_update" && selectedDag) {
        await refreshGraph(selectedDag);
      }
    });

    return () => socket.close();
  }, [refreshGraph, selectedDag]);

  const triggerDag = async () => {
    if (!selectedDag) return;
    await fetch(`/api/dags/${selectedDag}/trigger`, { method: "PUT" });
    await refreshGraph(selectedDag);
  };

  const flow = useMemo(() => buildFlow(graph), [graph]);
  const activeDag = dags.find((d) => d.dag_id === selectedDag);
  const activeState = activeDag?.is_running ? "running" : "none";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="head">
          <p className="kicker">Riverflow</p>
          <h1 className="title">DAG Studio</h1>
        </div>

        <div className="controls">
          <button className="button" onClick={triggerDag} disabled={!selectedDag}>Trigger Selected DAG</button>
          <button className="button ghost" onClick={() => refreshGraph(selectedDag)} disabled={!selectedDag}>Refresh Graph</button>
          <button className="button ghost" onClick={refreshDags}>Refresh DAG List</button>
          <span className={`ws-badge ${wsOnline ? "online" : "offline"}`}>WS: {wsOnline ? "online" : "offline"}</span>
        </div>

        <div className="dag-list">
          {dags.map((dag) => (
            <article
              key={dag.dag_id}
              className={`dag-item ${dag.dag_id === selectedDag ? "active" : ""}`}
              onClick={() => setSelectedDag(dag.dag_id)}
            >
              <strong>{dag.dag_id}</strong>
              <div className="meta">runs: {dag.stats?.total_runs || 0}</div>
              <div className="meta">success: {Math.round(dag.stats?.success_rate || 0)}%</div>
            </article>
          ))}
        </div>
      </aside>

      <section className="main">
        <div className="main-top">
          <div>
            <strong>{selectedDag || "No DAG selected"}</strong>
            <div className="meta">run: {graph.run_id || "-"}</div>
          </div>
          <span className={`status ${dagStateClass(activeState)}`}>{dagStateClass(activeState)}</span>
        </div>

        <div className="graph-wrap">
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <MiniMap />
            <Controls />
            <Background color="#d8e2e9" gap={16} />
          </ReactFlow>
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
