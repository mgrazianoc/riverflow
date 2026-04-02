const metricsEl = document.getElementById("metrics");
const dagsEl = document.getElementById("dags-list");
const historyEl = document.getElementById("history-body");
const refreshBtn = document.getElementById("refresh-btn");
const wsBadge = document.getElementById("ws-badge");
const eventLog = document.getElementById("event-log");

const state = {
  dags: [],
  history: [],
};

function logEvent(message) {
  const now = new Date().toISOString();
  eventLog.textContent = `[${now}] ${message}\n` + eventLog.textContent;
}

function safeDuration(seconds) {
  if (seconds === null || seconds === undefined) {
    return "-";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  return `${Math.round(seconds / 60)}m`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function renderMetrics(status) {
  const cards = [
    { label: "Registered DAGs", value: status.registered_dags.length },
    { label: "Running DAGs", value: status.running_dags.length },
    { label: "History Size", value: status.total_history },
    { label: "WebSocket", value: wsBadge.classList.contains("badge-online") ? "Live" : "Offline" },
  ];

  metricsEl.innerHTML = cards
    .map(
      (card) =>
        `<article class="metric"><span class="label">${card.label}</span><span class="value">${card.value}</span></article>`
    )
    .join("");
}

function dagStateClass(dag) {
  if (dag.is_running) {
    return "running";
  }

  const stats = dag.stats || {};
  if ((stats.failed_count || 0) > 0 && (stats.last_run?.state === "failed")) {
    return "failed";
  }
  if ((stats.success_count || 0) > 0) {
    return "success";
  }
  return "idle";
}

async function triggerDag(dagId) {
  try {
    const response = await fetch(`/api/dags/${dagId}/trigger`, { method: "PUT" });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unknown trigger error");
    }
    logEvent(`Triggered ${dagId} (${payload.run_id || "accepted"})`);
  } catch (error) {
    logEvent(`Trigger failed for ${dagId}: ${error.message}`);
  } finally {
    await refresh();
  }
}

function renderDags() {
  dagsEl.innerHTML = state.dags
    .map((dag) => {
      const stats = dag.stats || {};
      const stateClass = dagStateClass(dag);
      return `
        <article class="dag-card">
          <div class="dag-meta">
            <strong>${dag.dag_id}</strong>
            <span class="state ${stateClass}">${stateClass}</span>
          </div>
          <div>
            <small>Total runs: ${stats.total_runs || 0}</small><br />
            <small>Success rate: ${Math.round(stats.success_rate || 0)}%</small><br />
            <small>Avg duration: ${safeDuration(stats.avg_duration_seconds)}</small>
          </div>
          <button class="btn btn-primary" data-dag-trigger="${dag.dag_id}">Trigger</button>
        </article>`;
    })
    .join("");

  document.querySelectorAll("[data-dag-trigger]").forEach((button) => {
    button.addEventListener("click", () => triggerDag(button.dataset.dagTrigger));
  });
}

function renderHistory() {
  historyEl.innerHTML = state.history
    .map(
      (run) => `
        <tr>
          <td>${run.dag_id}</td>
          <td>${run.run_id}</td>
          <td><span class="state ${run.state}">${run.state}</span></td>
          <td>${formatDate(run.start_time)}</td>
          <td>${safeDuration(run.duration_seconds)}</td>
        </tr>
      `
    )
    .join("");
}

async function refresh() {
  const [statusRes, dagsRes, historyRes] = await Promise.all([
    fetch("/api/status"),
    fetch("/api/dags"),
    fetch("/api/history?limit=20"),
  ]);

  const status = await statusRes.json();
  const dagsPayload = await dagsRes.json();
  const historyPayload = await historyRes.json();

  state.dags = dagsPayload.dags || [];
  state.history = historyPayload.runs || [];

  renderMetrics(status);
  renderDags();
  renderHistory();
}

function connectWs() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

  socket.addEventListener("open", () => {
    wsBadge.textContent = "WS: online";
    wsBadge.classList.remove("badge-offline");
    wsBadge.classList.add("badge-online");
    logEvent("WebSocket connected");
  });

  socket.addEventListener("message", async (event) => {
    const payload = JSON.parse(event.data);
    logEvent(`Event: ${payload.type}`);
    await refresh();
  });

  socket.addEventListener("close", () => {
    wsBadge.textContent = "WS: offline";
    wsBadge.classList.remove("badge-online");
    wsBadge.classList.add("badge-offline");
    logEvent("WebSocket disconnected, retrying in 3s");
    setTimeout(connectWs, 3000);
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

refreshBtn.addEventListener("click", refresh);

(async function bootstrap() {
  await refresh();
  connectWs();
})();
