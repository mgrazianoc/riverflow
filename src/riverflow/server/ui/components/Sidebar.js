import { html } from "../lib/html.js";
import { stateClass } from "../lib/format.js";

export function Sidebar({
  dags,
  selectedDag,
  onSelectDag,
  onTrigger,
  onRefresh,
  wsOnline,
  filter,
  onFilterChange,
}) {
  const filtered = filter
    ? dags.filter((d) => d.dag_id.toLowerCase().includes(filter.toLowerCase()))
    : dags;

  return html`
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="brand">
          <span class="brand-icon">≋</span>
          <div>
            <div class="brand-name">Riverflow</div>
            <div class="brand-sub">DAG Studio</div>
          </div>
        </div>
        <span class="ws-badge ${wsOnline ? "online" : "offline"}">
          ${wsOnline ? "●" : "○"} ${wsOnline ? "Live" : "Offline"}
        </span>
      </div>

      <div class="sidebar-actions">
        <button
          class="btn btn-primary"
          onClick=${onTrigger}
          disabled=${!selectedDag}
        >
          ▶ Trigger DAG
        </button>
        <button class="btn btn-ghost" onClick=${onRefresh}>
          ↻ Refresh
        </button>
      </div>

      <div class="sidebar-search">
        <input
          type="text"
          class="search-input"
          placeholder="Filter DAGs..."
          value=${filter}
          onInput=${(e) => onFilterChange(e.target.value)}
        />
      </div>

      <div class="dag-list">
        ${filtered.length === 0 && html`
          <div class="dag-list-empty">No DAGs found</div>
        `}
        ${filtered.map(
          (dag) => html`
            <article
              key=${dag.dag_id}
              class="dag-card ${dag.dag_id === selectedDag ? "active" : ""}"
              onClick=${() => onSelectDag(dag.dag_id)}
            >
              <div class="dag-card-header">
                <strong class="dag-card-name">${dag.dag_id}</strong>
                ${dag.is_running && html`
                  <span class="pulse-dot" />
                `}
              </div>
              <div class="dag-card-stats">
                <span class="dag-stat">
                  <span class="dag-stat-val">${dag.stats?.total_runs || 0}</span> runs
                </span>
                <span class="dag-stat">
                  <span class="dag-stat-val ${stateClass(dag.stats?.success_rate >= 80 ? "success" : dag.stats?.success_rate >= 50 ? "none" : "failed")}">
                    ${Math.round(dag.stats?.success_rate || 0)}%
                  </span> success
                </span>
              </div>
            </article>
          `
        )}
      </div>
    </aside>
  `;
}
