import { NavLink, Outlet } from 'react-router'
import { Activity, Box, Settings } from 'lucide-react'
import { StatusDot } from './StatusBadge'
import { useLiveUpdates } from '../hooks/useLiveUpdates'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/ui', icon: Activity, label: 'Dashboard', end: true },
  { to: '/ui/dags', icon: Box, label: 'DAGs', end: false },
  { to: '/ui/config', icon: Settings, label: 'Settings', end: true },
]

export function Shell() {
  const connected = useLiveUpdates()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-bg-raised">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <svg viewBox="0 0 32 32" className="size-6 shrink-0">
            <circle cx="16" cy="16" r="14" fill="#3b82f6" />
            <path
              d="M10 12 Q16 8 22 12 Q16 16 10 20 Q16 16 22 20"
              fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
            />
          </svg>
          <div className="leading-none">
            <div className="text-sm font-semibold tracking-tight">Riverflow</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">
              Studio
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-2.5 pt-2">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-bg-surface text-ink'
                    : 'text-ink-secondary hover:bg-bg-hover hover:text-ink',
                )
              }
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-3.5 text-xs text-ink-muted">
          <StatusDot alive={connected} />
          {connected ? 'Connected' : 'Reconnecting…'}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
