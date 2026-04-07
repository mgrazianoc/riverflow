import { useState, useEffect } from "react";
import { html } from "../lib/html.js";
import { stateClass } from "../lib/format.js";

export function TaskDetail({ task, runId, dagId, onClose, onTriggerTask, api }) {
  if (!task) return null;

  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Reset logs when task or run changes
  useEffect(() => {
    setLogs([]);
    setShowLogs(false);
  }, [task?.id, runId]);

  const fetchLogs = async () => {
    if (!runId || !task?.id || !api) return;
    setLoadingLogs(true);
    try {
      const data = await api.getRunLogs(runId, task.id);
      setLogs(data.logs || []);
      setShowLogs(true);
    } catch { /* ignore */ }
    setLoadingLogs(false);
  };

  const handleTrigger = async () => {
    if (onTriggerTask && dagId && task?.id) {
      await onTriggerTask(dagId, task.id);
    }
  };

  return html`
    <div class="task-detail">
      <div class="task-detail-header">
        <h3 class="task-detail-name">${task.label}</h3>
        <button class="task-detail-close" onClick=${onClose}>✕</button>
      </div>
      <div class="task-detail-body">
        <div class="task-detail-row">
          <span class="task-detail-label">State</span>
          <span class="task-detail-value status ${stateClass(task.state)}">
            ${task.state || "idle"}
          </span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Trigger Rule</span>
          <span class="task-detail-value">${task.trigger_rule}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Retries</span>
          <span class="task-detail-value">${task.retries || 0}</span>
        </div>

        <div class="task-detail-actions">
          <button
            class="btn btn-primary btn-sm"
            onClick=${handleTrigger}
            disabled=${!dagId}
          >▶ Run Task</button>
          <button
            class="btn btn-ghost btn-sm"
            onClick=${fetchLogs}
            disabled=${!runId || loadingLogs}
          >${loadingLogs ? "Loading…" : "View Logs"}</button>
        </div>

        ${showLogs && html`
          <div class="task-logs">
            <div class="task-logs-header">
              <span class="task-detail-label">Logs</span>
              <span class="task-logs-count">${logs.length} entries</span>
            </div>
            ${logs.length === 0
              ? html`<div class="task-logs-empty">No logs captured for this run</div>`
              : html`
                <div class="task-logs-list">
                  ${logs.map(
                    (log, i) => html`
                      <div key=${i} class="task-log-entry ${log.level?.toLowerCase()}">
                        <span class="task-log-level">${log.level}</span>
                        <span class="task-log-msg">${log.message}</span>
                      </div>
                    `
                  )}
                </div>
              `}
          </div>
        `}
      </div>
    </div>
  `;
}
