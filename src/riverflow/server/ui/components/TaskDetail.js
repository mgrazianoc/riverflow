import { html } from "../lib/html.js";
import { stateClass } from "../lib/format.js";

export function TaskDetail({ task, onClose }) {
  if (!task) return null;

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
      </div>
    </div>
  `;
}
