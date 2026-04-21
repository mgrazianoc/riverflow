import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Shell } from './components/Shell'
import { ToastProvider } from './components/Toast'
import { Dashboard } from './pages/Dashboard'
import { DAGList } from './pages/DAGList'
import { DAGDetail, DAGOverview, DAGHistory, DAGTasks } from './pages/DAGDetail'
import { RunDetail } from './pages/RunDetail'
import { Host } from './pages/Host'
import { Settings } from './pages/Settings'
import './index.css'

// Heavy visualisation tabs — loaded on demand. xyflow alone is ~180kB.
const DAGGraphTab = lazy(() => import('./pages/DAGGraph').then((m) => ({ default: m.DAGGraphTab })))
const DAGGrid = lazy(() => import('./pages/DAGGrid').then((m) => ({ default: m.DAGGrid })))
const DAGGantt = lazy(() => import('./pages/DAGGantt').then((m) => ({ default: m.DAGGantt })))

// Editorial loading indicator — no spinner, just a hairline wait cue.
function LazyFallback() {
  return (
    <div className="mx-auto max-w-7xl px-8 pt-10 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
      Loading…
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 2000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/ui" element={<Dashboard />} />
              <Route path="/ui/dags" element={<DAGList />} />
              <Route path="/ui/dags/:dagId" element={<DAGDetail />}>
                <Route index element={<DAGOverview />} />
                <Route
                  path="graph"
                  element={
                    <Suspense fallback={<LazyFallback />}>
                      <DAGGraphTab />
                    </Suspense>
                  }
                />
                <Route
                  path="grid"
                  element={
                    <Suspense fallback={<LazyFallback />}>
                      <DAGGrid />
                    </Suspense>
                  }
                />
                <Route
                  path="gantt"
                  element={
                    <Suspense fallback={<LazyFallback />}>
                      <DAGGantt />
                    </Suspense>
                  }
                />
                <Route path="history" element={<DAGHistory />} />
                <Route path="tasks" element={<DAGTasks />} />
              </Route>
              <Route path="/ui/runs/:runId" element={<RunDetail />} />
              <Route path="/ui/host" element={<Host />} />
              <Route path="/ui/config" element={<Settings />} />
              <Route path="*" element={<Navigate to="/ui" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
