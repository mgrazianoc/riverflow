import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { DAGList } from './pages/DAGList'
import { DAGDetail, DAGOverview, DAGHistory, DAGTasks } from './pages/DAGDetail'
import { RunDetail } from './pages/RunDetail'
import { Host } from './pages/Host'
import { Settings } from './pages/Settings'

const DAGGraphTab = lazy(() => import('./pages/DAGGraph').then((m) => ({ default: m.DAGGraphTab })))
const DAGGrid = lazy(() => import('./pages/DAGGrid').then((m) => ({ default: m.DAGGrid })))
const DAGGantt = lazy(() => import('./pages/DAGGantt').then((m) => ({ default: m.DAGGantt })))

function LazyFallback() {
  return (
    <div className="mx-auto max-w-[1440px] px-8 pt-10 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
      Loading…
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/ui" element={<Dashboard />} />
        <Route path="/ui/dags" element={<DAGList />} />
        <Route path="/ui/dags/:dagId" element={<DAGDetail />}>
          <Route index element={<Navigate to="graph" replace />} />
          <Route path="graph" element={<Suspense fallback={<LazyFallback />}><DAGGraphTab /></Suspense>} />
          <Route path="overview" element={<DAGOverview />} />
          <Route path="grid" element={<Suspense fallback={<LazyFallback />}><DAGGrid /></Suspense>} />
          <Route path="gantt" element={<Suspense fallback={<LazyFallback />}><DAGGantt /></Suspense>} />
          <Route path="history" element={<DAGHistory />} />
          <Route path="tasks" element={<DAGTasks />} />
        </Route>
        <Route path="/ui/runs/:runId" element={<RunDetail />} />
        <Route path="/ui/host" element={<Host />} />
        <Route path="/ui/config" element={<Settings />} />
        <Route path="*" element={<Navigate to="/ui" replace />} />
      </Route>
    </Routes>
  )
}
