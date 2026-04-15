import { useCallback, useEffect, useRef, useState } from 'react'
import type { DAGRun } from '../types'

type WSMessage =
  | { type: 'connected'; data: { registered_dags: string[] } }
  | { type: 'dag_update'; data: DAGRun }
  | { type: 'history'; data: { runs: DAGRun[] } }
  | { type: 'current_runs'; data: { running_dags: DAGRun[] } }
  | { type: 'pong' }

export function useWebSocket(onMessage: (msg: WSMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setTimeout(connect, 3000)
    }
    ws.onmessage = (e) => {
      try { cbRef.current(JSON.parse(e.data)) } catch { /* skip */ }
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  return connected
}
