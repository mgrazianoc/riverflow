import { html } from "../lib/html.js";
import { stateClass, timeAgo, formatDuration } from "../lib/format.js";

export function HistoryPanel({ runs, selectedDag }) {
  const filtered = selectedDag
    ? runs.filter((r) => r.dag_id === selectedDag)
    : runs;

  const recent = filtered.slice(0, 20);

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
            <div key=${run.run_id} class="history-row">
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
          `
        )}
      </div>
    </div>
  `;
}
