import { useEffect, useRef, useState } from 'react'
import type { DAGRun, FlowRun } from '../types'

type WSMessage =
  | { type: 'connected'; data: { registered_dags: string[] } }
  | { type: 'dag_update'; data: DAGRun }
  | { type: 'flow_update'; data: FlowRun }
  | { type: 'history'; data: { runs: DAGRun[] } }
  | { type: 'current_runs'; data: { running_dags: DAGRun[] } }
  | { type: 'pong' }

export function useWebSocket(onMessage: (msg: WSMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const cbRef = useRef(onMessage)

  useEffect(() => {
    cbRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        if (!disposed) setConnected(true)
      }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        if (disposed) return
        setConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }
      ws.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data)) } catch { /* skip */ }
      }
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [])

  return connected
}
