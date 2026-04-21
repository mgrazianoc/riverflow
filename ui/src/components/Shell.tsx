import { NavLink, Outlet, useNavigate } from 'react-router'
import { Logo } from './Logo'
import { CommandPalette } from './CommandPalette'
import { useLiveUpdates } from '../hooks/useLiveUpdates'
import { useSequenceShortcut } from '../hooks/useShortcut'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/ui', label: 'Overview', end: true },
  { to: '/ui/dags', label: 'DAGs', end: false },
  { to: '/ui/host', label: 'Host', end: false },
  { to: '/ui/config', label: 'System', end: true },
]

/**
 * Broadsheet shell — masthead on top, rule underneath, content below.
 * No sidebar. Navigation is text-first and Cmd-K-first.
 */
export function Shell() {
  const connected = useLiveUpdates()
  const navigate = useNavigate()
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

  // Global Vim-style nav: g d, g l, g h, g s.
  useSequenceShortcut('g', 'd', () => navigate('/ui'))
  useSequenceShortcut('g', 'l', () => navigate('/ui/dags'))
  useSequenceShortcut('g', 'h', () => navigate('/ui/host'))
  useSequenceShortcut('g', 's', () => navigate('/ui/config'))

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Masthead */}
      <header className="shrink-0 border-b border-border bg-bg">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-10 px-8">
          {/* Brand */}
          <NavLink to="/ui" end className="flex items-center gap-2.5 text-ink">
            <Logo size={18} className="shrink-0" />
            <span className="font-display text-[17px] font-medium tracking-tight">
              Riverflow
            </span>
          </NavLink>

          {/* Nav — text only, editorial rhythm */}
          <nav className="flex items-center gap-6">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'text-[13px] transition-colors',
                    isActive
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-ink-secondary',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right — liveness + Cmd-K hint */}
          <div className="ml-auto flex items-center gap-5 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-block size-1.5 rounded-full',
                  connected ? 'bg-success' : 'bg-ink-muted',
                )}
                aria-label={connected ? 'Connected' : 'Disconnected'}
              />
              <span className="tabular-nums">{connected ? 'Live' : 'Reconnecting'}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'k', [isMac ? 'metaKey' : 'ctrlKey']: true, bubbles: true,
                }))
              }}
              className="flex items-center gap-1 text-ink-muted transition-colors hover:text-ink-secondary"
              title="Open command palette"
            >
              <kbd className="rounded-sm border border-border bg-bg-raised px-1 font-mono text-[9px] leading-4">
                {isMac ? '⌘' : 'Ctrl'}
              </kbd>
              <kbd className="rounded-sm border border-border bg-bg-raised px-1 font-mono text-[9px] leading-4">K</kbd>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-bg">
        <Outlet />
      </main>

      <CommandPalette />
    </div>
  )
}

