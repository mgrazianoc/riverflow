import { useState, useEffect, useCallback } from "react";
import { html } from "../lib/html.js";
import { stateClass } from "../lib/format.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { useApi } from "../hooks/useApi.js";
import { Sidebar } from "./Sidebar.js";
import { DagGraph } from "./DagGraph.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { TaskDetail } from "./TaskDetail.js";

export function App() {
  const [dags, setDags] = useState([]);
  const [selectedDag, setSelectedDag] = useState("");
  const [graph, setGraph] = useState({ nodes: [], edges: [], is_running: false });
  const [history, setHistory] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("graph");

  const api = useApi();

  const refreshDags = useCallback(async () => {
    try {
      const payload = await api.getDags();
      const dagItems = payload.dags || [];
      setDags(dagItems);
      if (!selectedDag && dagItems.length > 0) {
        setSelectedDag(dagItems[0].dag_id);
      }
    } catch { /* network error — ws reconnect will retry */ }
  }, [api, selectedDag]);

  const refreshGraph = useCallback(
    async (dagId) => {
      if (!dagId) return;
      try {
        const payload = await api.getDagGraph(dagId);
        setGraph(payload);
      } catch { /* ignore */ }
    },
    [api]
  );

  const refreshHistory = useCallback(async () => {
    try {
      const payload = await api.getHistory();
      setHistory(payload.runs || []);
    } catch { /* ignore */ }
  }, [api]);

  // Initial load
  useEffect(() => {
    refreshDags();
    refreshHistory();
  }, []);

  // When selected DAG changes
  useEffect(() => {
    refreshGraph(selectedDag);
    setSelectedTask(null);
  }, [selectedDag]);

  // WebSocket handler
  const wsOnline = useWebSocket(
    useCallback(
      (msg) => {
        if (msg.type === "dag_update") {
          if (selectedDag) refreshGraph(selectedDag);
          refreshDags();
          refreshHistory();
        }
        if (msg.type === "history") {
          setHistory(msg.data?.runs || []);
        }
      },
      [selectedDag, refreshGraph, refreshDags, refreshHistory]
    )
  );

  const handleTrigger = async () => {
    if (!selectedDag) return;
    await api.triggerDag(selectedDag);
    refreshGraph(selectedDag);
  };

  const handleTriggerTask = async (dagId, taskId) => {
    await api.triggerTask(dagId, taskId);
    refreshGraph(dagId);
    refreshHistory();
  };

  const handleRefresh = () => {
    refreshDags();
    refreshGraph(selectedDag);
    refreshHistory();
  };

  const activeDag = dags.find((d) => d.dag_id === selectedDag);
  const runState = activeDag?.is_running ? "running" : graph.run_id ? "idle" : "none";

  return html`
    <div class="app">
      <${Sidebar}
        dags=${dags}
        selectedDag=${selectedDag}
        onSelectDag=${setSelectedDag}
        onTrigger=${handleTrigger}
        onRefresh=${handleRefresh}
        wsOnline=${wsOnline}
        filter=${filter}
        onFilterChange=${setFilter}
      />

      <main class="main">
        <header class="main-header">
          <div class="main-header-left">
            <h2 class="main-title">${selectedDag || "No DAG selected"}</h2>
            ${graph.run_id && html`
              <span class="main-run-id">run: ${graph.run_id}</span>
            `}
          </div>
          <div class="main-header-right">
            ${activeDag?.is_running && html`
              <span class="status running">Running</span>
            `}
            <div class="tab-bar">
              <button
                class="tab ${tab === "graph" ? "active" : ""}"
                onClick=${() => setTab("graph")}
              >Graph</button>
              <button
                class="tab ${tab === "history" ? "active" : ""}"
                onClick=${() => setTab("history")}
              >History</button>
            </div>
          </div>
        </header>

        <div class="main-body">
          ${tab === "graph" && html`
            <div class="graph-area">
              <div class="graph-wrap">
                <${DagGraph}
                  graph=${graph}
                  onNodeClick=${setSelectedTask}
                />
              </div>
              ${selectedTask && html`
                <${TaskDetail}
                  task=${selectedTask}
                  runId=${graph.run_id}
                  dagId=${selectedDag}
                  api=${api}
                  onTriggerTask=${handleTriggerTask}
                  onClose=${() => setSelectedTask(null)}
                />
              `}
            </div>
          `}
          ${tab === "history" && html`
            <${HistoryPanel}
              runs=${history}
              selectedDag=${selectedDag}
            />
          `}
        </div>
      </main>
    </div>
  `;
}
