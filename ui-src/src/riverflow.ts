/**
 * Riverflow UI — TypeScript that powers:
 * 1. WebSocket connection → HTMX event bridge
 * 2. DAG graph layout via dagre (auto-positioned nodes + SVG edges)
 *
 * HTMX handles all DOM updates via server-rendered partials.
 */

import type { DAGRunModel, TaskState, WSMessage } from "./types/models";
import { graphlib, layout } from "@dagrejs/dagre";

// ── Types ──────────────────────────────────────

interface GraphEdge {
  source: string;
  target: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// ── WebSocket ──────────────────────────────────────

class RiverflowWS {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private badge: HTMLElement | null = null;

  constructor() {
    this.badge = document.getElementById("ws-badge");
    this.connect();
  }

  private connect(): void {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setBadge("online");
    };

    this.ws.onclose = () => {
      this.setBadge("offline");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };
  }

  private handleMessage(msg: WSMessage): void {
    if (msg.type === "dag_update") {
      const data = msg.data as DAGRunModel | undefined;
      // Patch graph node states in-place (no HTMX re-render → no flicker)
      if (data?.task_states) {
        patchGraphNodeStates(data.dag_id, data.task_states);
      }
      document.body.dispatchEvent(
        new CustomEvent("dag-updated", { detail: msg.data })
      );
    }
  }

  private setBadge(state: "online" | "offline"): void {
    if (!this.badge) return;
    this.badge.className = `ws-badge ${state}`;
    this.badge.textContent = state;
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay
    );
  }
}

// ── In-place Graph State Patching ──────────────────

/** All possible CSS state classes on graph nodes */
const STATE_CLASSES = [
  "state-none",
  "state-running",
  "state-success",
  "state-failed",
  "state-skipped",
  "state-upstream_failed",
  "state-timeout",
];

/**
 * Patch graph node visual states in-place without replacing DOM.
 * This avoids the full dagre re-layout that causes flickering.
 */
function patchGraphNodeStates(
  dagId: string,
  taskStates: Record<string, TaskState>
): void {
  const container = document.querySelector<HTMLElement>(
    `.graph-container[data-dag-id="${dagId}"]`
  );
  if (!container) return;

  for (const [taskId, state] of Object.entries(taskStates)) {
    const node = container.querySelector<HTMLElement>(
      `.graph-node[data-task-id="${taskId}"]`
    );
    if (!node) continue;

    // Update CSS class
    node.classList.remove(...STATE_CLASSES);
    node.classList.add(`state-${state}`);

    // Update state label text
    const stateLabel = node.querySelector<HTMLElement>(".node-state");
    if (stateLabel) stateLabel.textContent = state;
  }
}

// ── DAG Graph Layout (dagre) ──────────────────────────

/**
 * Lay out a .graph-container using dagre for proper DAG positioning.
 * Measures nodes in their flex layout, then repositions them absolutely
 * and draws SVG edge paths with arrowheads.
 */
function layoutDagGraph(container: HTMLElement): void {
  const nodeEls = Array.from(
    container.querySelectorAll<HTMLElement>(".graph-node[data-task-id]")
  );
  if (nodeEls.length === 0) return;

  // Parse edge data from embedded JSON
  const script = container.querySelector<HTMLScriptElement>("#graph-edges");
  let edges: GraphEdge[] = [];
  if (script?.textContent) {
    try {
      edges = JSON.parse(script.textContent);
    } catch {
      /* malformed edge data */
    }
  }

  // ── Measure nodes while still in flex layout ──
  const sizes = new Map<string, { w: number; h: number }>();
  for (const el of nodeEls) {
    const id = el.dataset.taskId;
    if (id) sizes.set(id, { w: el.offsetWidth, h: el.offsetHeight });
  }

  // ── Build dagre graph ──
  const g = new graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 28,
    ranksep: 64,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [id, s] of sizes) {
    g.setNode(id, { width: s.w, height: s.h });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  // ── Compute layout ──
  layout(g);

  // ── Position nodes absolutely ──
  container.classList.add("graph-laid-out");

  for (const el of nodeEls) {
    const id = el.dataset.taskId;
    if (!id) continue;
    const n = g.node(id);
    el.style.left = `${n.x - n.width / 2}px`;
    el.style.top = `${n.y - n.height / 2}px`;
  }

  // Resize container to fit the graph
  const gi = g.graph();
  const gw: number = (gi.width ?? 200) + 48;
  const gh: number = (gi.height ?? 100) + 48;
  container.style.minWidth = `${gw}px`;
  container.style.minHeight = `${gh}px`;

  // ── Draw SVG edges ──
  container.querySelector(".graph-edges-svg")?.remove();
  if (edges.length === 0) return;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("graph-edges-svg");
  svg.setAttribute("width", String(gw));
  svg.setAttribute("height", String(gh));
  container.insertBefore(svg, container.firstChild);

  // Arrowhead marker
  const defs = document.createElementNS(SVG_NS, "defs");
  const marker = document.createElementNS(SVG_NS, "marker");
  marker.id = "dag-arrow";
  marker.setAttribute("viewBox", "0 0 10 8");
  marker.setAttribute("refX", "10");
  marker.setAttribute("refY", "4");
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto-start-reverse");
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", "0 0, 10 4, 0 8");
  poly.setAttribute("fill", "#94a3b8");
  marker.appendChild(poly);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Draw each edge as a polyline path
  for (const e of edges) {
    const ed = g.edge(e.source, e.target);
    if (!ed?.points || ed.points.length < 2) continue;

    const pts: Array<{ x: number; y: number }> = ed.points;
    const f = (n: number) => n.toFixed(1);
    const d = pts
      .map((p, i) =>
        i === 0 ? `M${f(p.x)},${f(p.y)}` : `L${f(p.x)},${f(p.y)}`
      )
      .join(" ");

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "graph-edge");
    path.setAttribute("marker-end", "url(#dag-arrow)");
    svg.appendChild(path);
  }
}

/** Lay out any new (un-laid-out) graph containers on the page. */
function initGraphs(): void {
  document
    .querySelectorAll<HTMLElement>(".graph-container:not(.graph-laid-out)")
    .forEach((c) => {
      // Only layout if visible (tab might be hidden)
      if (c.offsetParent !== null) layoutDagGraph(c);
    });
}

// ── Init ──────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  new RiverflowWS();
  requestAnimationFrame(initGraphs);
});

// Re-layout after HTMX partial swaps
document.body.addEventListener("htmx:afterSettle", () => {
  requestAnimationFrame(initGraphs);
});

// Layout when Graph tab becomes visible
document.addEventListener("click", (e) => {
  const tab = (e.target as Element).closest?.(".tab[data-tab='graph']");
  if (tab) requestAnimationFrame(initGraphs);
});
