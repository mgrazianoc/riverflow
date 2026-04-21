# Riverflow UI — Design Agent Guide

> Read this before touching any file under `ui/src/`. It exists to keep the
> UI from drifting back into generic "dashboard template" aesthetics.
> The identity is called **Broadsheet**: a light, editorial, data-first
> interface inspired by broadsheet newspapers and engineering logs.

---

## 1. Non-negotiable rules

1. **Light mode is the default identity.** Do not add `dark:` variants as a
   first move. If a dark mode ever ships, it will be a *separate* tuned
   palette (the `Instrument` variant), not an inversion.
2. **One accent color.** Slate-teal (`--color-accent`). Used only for:
   links (on hover/active), focus rings, the `running` state, and the
   primary data series in charts. **Never** as a background chrome, button
   fill, or decorative accent. Primary buttons fill with `--color-ink`.
3. **Status colors are muted earth pigments**, not neon dashboard quartet:
   forest / brick / mustard / slate-teal (running). They are tuned on a
   matched OKLCH ring so they read as true peers; do not substitute
   unrelated colors.
4. **All colors come from CSS custom properties** declared in
   `src/index.css` under `@theme`. **Never** hardcode hex, rgb, or
   Tailwind palette classes (`bg-zinc-*`, `text-gray-*`, `bg-black`,
   `text-white`, etc.). Use token classes: `bg-bg`, `text-ink`,
   `border-border`, `bg-accent`, `text-error`, etc.
5. **Three typefaces, no more:**
   - `font-display` (Fraunces, serif) — headlines, hero numbers,
     newsworthy figures. **Not** for UI chrome, labels, or body.
   - `font-sans` (Inter Tight) — everything UI by default.
   - `font-mono` (JetBrains Mono) — data cells: run IDs, timestamps,
     durations, numeric columns, uppercase labels.
6. **Radii are near-square:** `rounded-sm` (2px), `rounded-md` (3px),
   `rounded-lg` (4px). **Never** `rounded-xl`, `rounded-2xl`, or full.
7. **No emoji, no gradient backgrounds, no shadows bigger than
   `shadow-ink/20`, no blur panels.** Depth comes from hairline rules
   (`border-border`) and the contrast between `bg` / `bg-raised` /
   `bg-surface`.
8. **Icons:** prefer text glyphs (`→`, `↑`, `↓`, `·`) or nothing. When a
   real icon is needed, import from `lucide-react` and size ≤16px,
   stroke ≤1.75, color `text-ink-muted`. Never decorative.

---

## 2. Editorial page rhythm

Every top-level page follows the same broadsheet rhythm:

```tsx
<div className="mx-auto max-w-7xl px-8 pt-10 pb-14">
  {/* Masthead row: date/back link on left, section label on right */}
  <div className="mb-6 flex items-center justify-between">
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
      {date or breadcrumb}
    </span>
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
      {SECTION_LABEL}
    </span>
  </div>
  {/* Single ink hairline under the masthead */}
  <div className="border-t border-ink" />

  {/* Hero headline in Fraunces */}
  <h1 className="mt-8 font-display text-[32px] font-light leading-[1.05] tracking-[-0.015em] text-ink">
    {Title}
  </h1>

  {/* Sections separated by hairline border-border, never by cards */}
</div>
```

**Numbers tell the story.** When a number is the point of a headline,
enlarge it and give it a single color:

```tsx
<h1 className="font-display text-[42px] font-light leading-[1.05] tracking-[-0.015em]">
  <em className="not-italic text-error">{n}</em> failures in last 24h
</h1>
```

---

## 3. Standard patterns

### Small-caps label (every section header, every column header)

```tsx
<span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
  {label}
</span>
```

### Data cell (every table data column)

```tsx
<td className="py-3 font-mono text-[11px] tabular-nums text-ink">
  {value}
</td>
```

### Primary button

```tsx
<button className="bg-ink text-bg px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-accent">
  {Action}
</button>
```

### Error surface

```tsx
<div className="border-l-2 border-error pl-4 text-error">
  {message}
</div>
```

### Hairline divider in a list

```tsx
<ul className="divide-y divide-border/60">
```

---

## 4. Identity primitives (do not replace without discussion)

These three SVG components are the visual signature of the UI. If you
need a new chart, start from one of them; do not reach for Recharts,
Chart.js, Nivo, or D3.

- **`ActivityChart`** (`components/ActivityChart.tsx`) — the Dashboard
  hero. Layered SVG: success-rate area + p95 duration dashed line +
  failure bars. 14-day daily buckets with gap handling. Uses only
  `--color-accent`, `--color-error`, `--color-border`.
- **`Sparkline`** (`components/Sparkline.tsx`) — per-row duration bars.
  120×20 SVG, scaled to the row's own max, failures tinted brick.
- **`RunStrip`** (`components/RunStrip.tsx`) — 20-cell square run-state
  strip, earth palette.

All three share the same palette, same hairline baseline, same mono
scale. Keep them consistent.

---

## 5. What NOT to do (common regressions)

| ❌ Don't                                   | ✅ Do instead                             |
| ----------------------------------------- | ---------------------------------------- |
| `bg-violet-500`, `from-blue-500 to-cyan-500` gradients | `bg-accent` or `bg-ink`, never gradients |
| `bg-zinc-*`, `text-gray-*`, `bg-black`, `text-white` | Token classes: `bg-bg-raised`, `text-ink`, `bg-ink`, `text-bg` |
| `rounded-xl`, `rounded-full` on cards    | `rounded-sm` / `rounded-md` / no radius |
| Glassmorphism, `backdrop-blur`           | Solid `bg-bg-raised` with `border-border` |
| Colored status dots on every row         | Use `StateBadge` or `RunStrip` |
| Icon-heavy sidebars                      | Text-only nav in the masthead |
| Fraunces for body text or UI             | Inter Tight for UI, mono for data |
| `shadow-2xl`, dramatic drop shadows      | `shadow-ink/10` max, or none |
| Adding a "stats card" grid to a page     | Inline the number into a Fraunces headline |
| Sorting/filter state that vanishes on reload | Use `useUrlState` (URL params) or `useLocalStorage` |

---

## 6. Color system (OKLCH, wide-gamut)

The palette is authored in OKLCH so it renders correctly on wide-gamut
(Display-P3) monitors — the slate-teal accent and earth status colors
look dull and cool in bare sRGB. The status quartet is tuned on a
matched OKLCH ring (L ≈ 0.5, similar C) so forest / brick / mustard
read as true peers rather than a random grab-bag.

When adding a color (rare), match that discipline:

- Stay inside `L ∈ [0.3, 0.7]` for any surface that carries type.
- Chroma ≤ 0.13 for semantic colors. Above that starts to feel like a
  dashboard template.
- Hue should be pigment-adjacent (ochre, sienna, terre verte, slate),
  never pure primaries or screen neons.

If you need a new semantic color, add it to `@theme` in
`src/index.css` alongside the others; never inline.

---

## 7. State persistence

Filters, sort state, and tab selections that the user actively sets
MUST survive a reload. Two hooks exist:

- **`useUrlState`** (`hooks/useUrlState.ts`) — for filters that make
  sense to share (state filter, search query, date range). State lives
  in the URL querystring so links can be copied.
- **`useLocalStorage`** (`hooks/useLocalStorage.ts`) — for preferences
  (sort key/direction, viewer toggles). Personal, not shared.

Rule of thumb: *"Would I paste this URL to a teammate?"* → URL state.
*"Is this my own preference?"* → localStorage.

---

## 8. When adding a page

1. Follow the editorial rhythm from §2.
2. If the page has a dense table, include a `RunStrip` and/or
   `Sparkline` column — those are the visual glue across pages.
3. Put the newsworthy number into the Fraunces headline with a single
   `<em className="not-italic text-{success|error|accent}">` around
   the number. Do not add a "stats card" grid.
4. All tabular data in `font-mono tabular-nums`.
5. Filters/sort go in a hairline-bordered row under the headline,
   wired through `useUrlState` or `useLocalStorage`.
6. Run `npm run build` before committing — TypeScript strict is on.

---

## 9. File map

```
ui/src/
  index.css                    # Palette + type + radii (authoritative)
  components/
    ActivityChart.tsx          # Dashboard hero chart (identity)
    Sparkline.tsx              # Per-row duration micro-chart (identity)
    RunStrip.tsx               # 20-cell run-state strip (identity)
    StatusBadge.tsx            # State dot + label
    Shell.tsx                  # Masthead + nav
    Logo.tsx                   # Wordmark glyph
    Toast.tsx                  # Ephemeral notifications
    Skeleton.tsx               # Loading row shimmer
    QueryState.tsx             # Error/empty states
    RelativeTime.tsx           # "3m ago" live updating
    LogViewer.tsx              # Ink-on-paper log panel
    CommandPalette.tsx         # ⌘K search
  hooks/
    useLocalStorage.ts         # Persistent prefs
    useUrlState.ts             # Shareable filter/view state
    useShortcut.ts             # Keyboard shortcuts
    useLiveUpdates.ts          # WS → query cache
    useWebSocket.ts            # WS connection mgmt
  pages/
    Dashboard.tsx              # Overview + ActivityChart
    DAGList.tsx                # All DAGs table
    DAGDetail.tsx              # Per-DAG overview/history/tasks
    RunDetail.tsx              # Per-run logs + tasks
    Settings.tsx               # System status
    DAGGraph.tsx               # xyflow task graph
    DAGGantt.tsx               # Run timeline
    DAGGrid.tsx                # Runs matrix
  lib/
    utils.ts                   # cn, formatDuration, formatRate
```

---

*Last substantive rewrite: the Broadsheet identity pass. If you find
yourself wanting to add a gradient or a violet accent, close the
branch and re-read this file.*
