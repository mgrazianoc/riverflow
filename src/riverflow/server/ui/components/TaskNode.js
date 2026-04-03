import { html } from "../lib/html.js";
import { Position } from "reactflow";

const Handle = ({ type, position }) =>
  html`<div class="react-flow__handle react-flow__handle-${type === "target" ? "top" : "bottom"}"
    style=${{
      position: "absolute",
      [type === "target" ? "top" : "bottom"]: "-4px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: "#94a3b8",
      border: "2px solid #fff",
    }}
  />`;

export function TaskNode({ data }) {
  const stateIcon = {
    running: "◉",
    success: "✓",
    failed: "✕",
    timeout: "⏱",
    upstream_failed: "⚠",
    skipped: "⊘",
    none: "○",
  }[data.state] || "○";

  return html`
    <div class="rf-node ${data.state || "none"}">
      <${Handle} type="target" position=${Position.Top} />
      <div class="rf-node-header">
        <span class="rf-node-icon ${data.state || "none"}">${stateIcon}</span>
        <span class="rf-node-name">${data.label}</span>
      </div>
      <div class="rf-node-meta">
        <span>${data.state || "idle"}</span>
        <span class="rf-node-sep">·</span>
        <span>${data.trigger_rule}</span>
      </div>
      ${data.retries > 0 && html`
        <div class="rf-node-meta">retries: ${data.retries}</div>
      `}
      <${Handle} type="source" position=${Position.Bottom} />
    </div>
  `;
}

export const nodeTypes = { taskNode: TaskNode };
