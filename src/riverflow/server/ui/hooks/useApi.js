import { useState, useCallback } from "react";

export function useApi() {
  const [loading, setLoading] = useState(false);

  const fetchJson = useCallback(async (url, opts) => {
    setLoading(true);
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, []);

  const getDags = useCallback(() => fetchJson("/api/dags"), [fetchJson]);

  const getDagGraph = useCallback(
    (dagId) => fetchJson(`/api/dags/${encodeURIComponent(dagId)}/graph`),
    [fetchJson]
  );

  const getHistory = useCallback(
    (dagId) => {
      const url = dagId
        ? `/api/history?dag_id=${encodeURIComponent(dagId)}`
        : "/api/history";
      return fetchJson(url);
    },
    [fetchJson]
  );

  const triggerDag = useCallback(
    (dagId) =>
      fetchJson(`/api/dags/${encodeURIComponent(dagId)}/trigger`, {
        method: "PUT",
      }),
    [fetchJson]
  );

  const triggerTask = useCallback(
    (dagId, taskId) =>
      fetchJson(
        `/api/dags/${encodeURIComponent(dagId)}/tasks/${encodeURIComponent(taskId)}/trigger`,
        { method: "PUT" }
      ),
    [fetchJson]
  );

  const getRunLogs = useCallback(
    (runId, taskId) => {
      let url = `/api/runs/${encodeURIComponent(runId)}/logs`;
      if (taskId) url += `?task_id=${encodeURIComponent(taskId)}`;
      return fetchJson(url);
    },
    [fetchJson]
  );

  return { loading, getDags, getDagGraph, getHistory, triggerDag, triggerTask, getRunLogs };
}
