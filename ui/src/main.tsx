import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { DAGList } from './pages/DAGList'
import { DAGDetail, DAGOverview, DAGHistory, DAGTasks } from './pages/DAGDetail'
import { DAGGraphTab } from './pages/DAGGraph'
import { DAGGrid } from './pages/DAGGrid'
import { DAGGantt } from './pages/DAGGantt'
import { RunDetail } from './pages/RunDetail'
import { Settings } from './pages/Settings'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 2000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/ui" element={<Dashboard />} />
            <Route path="/ui/dags" element={<DAGList />} />
            <Route path="/ui/dags/:dagId" element={<DAGDetail />}>
              <Route index element={<DAGOverview />} />
              <Route path="graph" element={<DAGGraphTab />} />
              <Route path="grid" element={<DAGGrid />} />
              <Route path="gantt" element={<DAGGantt />} />
              <Route path="history" element={<DAGHistory />} />
              <Route path="tasks" element={<DAGTasks />} />
            </Route>
            <Route path="/ui/runs/:runId" element={<RunDetail />} />
            <Route path="/ui/config" element={<Settings />} />
            <Route path="*" element={<Navigate to="/ui" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
