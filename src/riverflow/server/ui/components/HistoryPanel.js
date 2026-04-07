import { useState } from "react";
import { html } from "../lib/html.js";
import { stateClass, timeAgo, formatDuration } from "../lib/format.js";

export function HistoryPanel({ runs, selectedDag }) {
  const [expandedRun, setExpandedRun] = useState(null);

  const filtered = selectedDag
    ? runs.filter((r) => r.dag_id === selectedDag)
    : runs;

  const recent = filtered.slice(0, 30);

  const toggleExpand = (runId) => {
    setExpandedRun(expandedRun === runId ? null : runId);
  };

  return html`
    <div class="history-panel">
      <div class="history-header">
        <h3 class="history-title">Run History</h3>
        <span class="history-count">${filtered.length} runs</span>
      </div>
      <div class="history-list">
        ${recent.length === 0 && html`
          <div class="history-empty">No executions yet</div>
        `}
        ${recent.map(
          (run) => html`
            <div key=${run.run_id} class="history-item">
              <div
                class="history-row ${expandedRun === run.run_id ? "expanded" : ""}"
                onClick=${() => toggleExpand(run.run_id)}
              >
                <span class="history-state ${stateClass(run.state)}">
                  ${run.state}
                </span>
                <span class="history-dag">${run.dag_id}</span>
                <span class="history-dur">
                  ${formatDuration(run.duration_seconds)}
                </span>
                <span class="history-time">
                  ${timeAgo(run.start_time)}
                </span>
              </div>
              ${expandedRun === run.run_id && html`
                <div class="history-detail">
                  <div class="history-detail-row">
                    <span class="history-detail-label">Run ID</span>
                    <span class="history-detail-value mono">${run.run_id}</span>
                  </div>
                  ${run.task_states && Object.keys(run.task_states).length > 0 && html`
                    <div class="history-detail-row">
                      <span class="history-detail-label">Tasks</span>
                      <div class="history-tasks">
                        ${Object.entries(run.task_states).map(
                          ([tid, state]) => html`
                            <div key=${tid} class="history-task-chip">
                              <span class="history-task-name">${tid}</span>
                              <span class="status ${stateClass(state)}">${state}</span>
                            </div>
                          `
                        )}
                      </div>
                    </div>
                  `}
                  ${run.error && html`
                    <div class="history-detail-row">
                      <span class="history-detail-label">Error</span>
                      <span class="history-detail-value error-text">${run.error}</span>
                    </div>
                  `}
                </div>
              `}
            </div>
          `
        )}
      </div>
    </div>
  `;
}
