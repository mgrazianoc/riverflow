/**
 * Riverflow UI — minimal TypeScript that powers:
 * 1. WebSocket connection for real-time updates
 * 2. HTMX event dispatching on WS messages
 *
 * HTMX handles all DOM updates via server-rendered partials.
 * This file only bridges the WebSocket → HTMX event system.
 */

import type { WSMessage } from "./types/models";

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
      // Tell HTMX to refresh all partials listening for this event
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

// ── Init ──────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  new RiverflowWS();
});
