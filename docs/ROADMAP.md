# Deecide — Roadmap

Living doc of what we're about to build, in rough priority order. Each item
has:
- **Why** — user-stated pain or the value we expect
- **Scope** — concrete changes we intend, so we don't scope-creep
- **Open questions** — things to decide / investigate before touching code
- **Status** — `todo` → `in progress` → `done` (with commit SHA)

Housekeeping: when an item ships, move it to the "Done" log at the bottom
rather than deleting — useful to flip back through when we make decisions
that contradict an earlier choice.

> Last updated: 2026-04-18

---

## Mindset

- Ship incrementally — one item at a time, each commit self-contained,
  each visible change verified in the preview before moving on.
- Prefer a small, complete fix over a big, half-done one.
- When a change touches the core (chart internals, URL state, shared
  primitives), land it behind a verification loop (lint → build → reload
  preview → DOM-confirm) before touching adjacent features.
- Each item is a chance to follow `docs/PRINCIPLES.md`. If the work here
  and the principles diverge, the principles win — note the conflict
  instead of quietly breaking them.

---

## Upcoming — in the order we plan to tackle them

### 5. Move Benchmark / Show-decisions / Broker-imports into a chart-settings modal

**Why.** Those three filter controls sit above the chart eating
persistent visual real estate for options most users set once and
forget. The range presets (1M, 3M, 6M, …) deserve to stay visible
because they're the primary navigation; the rest doesn't.

**Scope.**
- Keep: range preset buttons (1M/3M/6M/YTD/1Y/2Y/3Y/5Y/MAX) visible
  above the chart.
- Move into a settings modal: Benchmark dropdown, Show-decisions type
  filter, Hide-broker-imports chip, From/To date inputs.
- Settings affordance: a small gear icon anchored at the chart's
  bottom-right corner (inside the plot area, doesn't push layout).
- Modal opens over the chart with these fields, OK / Cancel semantics.
  All changes already flow through URL state once that's wired so the
  deep-link shape doesn't change.

**Open questions.**
- Desktop default — maybe keep the filter bar visible on wide screens
  (≥md) where there's no space pressure? Or be uniform across widths
  for consistency? Leaning uniform.
- Gear icon placement: inside the plot (absolute bottom-right) vs in
  the chart toolbar row? Inside the plot keeps the toolbar row empty
  for the range presets.

**Status.** todo

---

### 6. Desktop chart interactions are borderline unusable

**Why.** The cursor is stuck on `crosshair` (from the range-drag),
clicks don't land reliably, and dragging over parts of the plot produces
surprising behaviour (sometimes selects, sometimes starts a drag that
doesn't go anywhere). The page is optimised for mobile gestures; desktop
needs a dedicated pass.

**Scope.**
- Audit desktop input flow on every interactive region of the chart:
  - background (should click to dismiss overlay, drag to measure)
  - price line / axis area (should hover → crosshair, click → nothing)
  - decision markers (should hover → pointer, click → open overlay)
  - cones (same as markers)
  - brush area (if still present after #3)
- Look at visx docs + examples for the "correct" desktop gesture model
  — nothing we're doing is novel.
- Fix cursor + hit-area behaviour per region.
- Verify range presets / date inputs / overlay all work with a mouse.

**Open questions.**
- Shift-drag for measure vs drag alone — which one does the user
  actually want for "measure % change between these two dates"?
- Do we want a hover tooltip showing (date, price) along the line?
  Many charting libs do this by default; we don't currently.

**Status.** todo

---

### 7. Centralise the per-page chart wrapper

**Why.** We've already consolidated the *rendering* into
`TimelineChartVisx` (popup, per-ticker, timeline all use it). But the
*wrapping chrome* (range-selector, date inputs, decision banner, drag
overlay, range-stats popup) is re-implemented in both
`TimelinePage.tsx` and `TickerTimelineChart.tsx` with slight drift.

**Scope.**
- Extract a `TimelineChartCard` wrapper component that owns:
  - range-preset buttons
  - From/To date inputs (if shown)
  - decision-click banner (lifted up from the chart)
  - drag-to-measure overlay + live stats pill
  - committed measure-selection stats pill
- `TimelinePage` becomes: URL state + actions filter + `<TimelineChartCard
  {...props}>` + `<DecisionsInRange>`.
- `TickerTimelineChart` becomes a thin adapter around
  `TimelineChartCard` with the per-ticker prop defaults
  (`showBrush={false}`, multi-benchmark array, etc).
- Popup already uses the raw chart; probably doesn't need the full
  wrapper — document that asymmetry.

**Open questions.**
- The measure-selection logic is entangled with the parent's wrapper
  layout (pixel-level drag maths reference `plotLeft/plotRight` which
  come from `getTimelineChartResponsiveMargin`). Moving this cleanly
  may require the wrapper to own those margins too.
- Naming: `TimelineChartCard` vs `ChartContainer` vs `TradingChart`?

**Status.** todo

---

### 8. Stale-idea resolve flow: audit + redesign

**Why.** The "Resolve" action on a stale-ticker card opens the full
`OutcomeFormDialog` with every field (realized P&L, outcome_date,
driver, pre-mortem notes, process_quality, outcome_quality,
process_score, outcome_score, closing_memo, error_type,
what_i_remember_now, notes …). For an old idea the user barely
remembers, that's an intimidating form. Suspect: half the fields are
unused in practice, half the copy is jargon, and the flow itself may
not match what the user actually does when closing the loop on a stale
idea.

**Scope.**
- **Phase 1 — explore** (no code changes). Walk the current
  `OutcomeFormDialog` end-to-end:
  - Every field it shows. Which ones does the user fill in practice?
    (Check the DB.)
  - Where does each field surface elsewhere in the app (charts,
    analytics, calibration)?
  - Does "outcome" mean the same thing for a pass vs a buy vs a sell
    vs a stale idea, or do we need different shapes?
- **Phase 2 — propose.** Write up findings + recommended flow redesign
  here (append to this file), then discuss before touching code.
- **Phase 3 — build.** Likely a simpler, task-specific dialog for the
  stale-idea case — maybe just "was it right / wrong / inconclusive"
  + optional notes, mirroring the pass-review swipe-action model.

**Open questions.**
- Is the full `OutcomeFormDialog` load-bearing elsewhere (EntryDetail,
  Insights), or can we diverge the flows without breaking parity?
- Should "resolving a stale idea" auto-generate an `actions` row (a
  decision to stop following the ticker) or just an `outcomes` row on
  the existing last action?

**Status.** todo

---

## Done (rolling log)

- **#4 Decisions-in-range date header restyle.** Commit `<next>`.
  Added `relativeBucket(dateStr)` that returns scannable primary labels
  ("Today", "Yesterday", "N days ago", "1 week ago", "N weeks ago",
  "Over a month ago", "Over a year ago"). Used as the serif-bold
  primary label on each date section; the exact date ("Mon, Apr 14 '26")
  is pushed to a tiny secondary on the right. Coarse buckets past one
  month so a long scroll of varying "3/4/5/6 months ago" labels reads
  as one consistent "Over a month ago" block instead of visual noise.

- **#3 Drop brush + tighten layout.** Commit `536ca5e`.
  TimelinePage now passes `showBrush={false}` to the chart — the 40-px
  brush rail is gone, chart plot reclaims that vertical room. Axis label
  fonts trimmed 11→10 on left, 14→11 on right, 10→9 / 12→10 on mobile
  so the y-axis eats less horizontal room too. "Decisions in range"
  header margin dropped mt: 2 → mt: 0.75 + mb: 0.5 → mb: 0.25 so the
  chart bottom doesn't leave an awkward gap above the list.
  Note: @visx/brush stays in deps for now — TimelineChartVisx's Brush
  component is rendered conditionally and still referenced when other
  embedders don't pass showBrush={false}. Next audit pass may remove
  it entirely once all consumers drop it.

- **#2 React Compiler + framework audit.** Commit `d1d70e6`.
  Audit findings:
  - **React Compiler** was already wired in `vite.config.ts` via
    `babel-plugin-react-compiler` in the `@vitejs/plugin-react` Babel
    plugin list. Confirmed active; auto-memoisation is running on every
    component. No change needed.
  - **Unused deps removed:** `html2canvas` (zero source imports) and
    `vite-plugin-node-polyfills` (listed in deps but never referenced
    by the vite config). Trims ~40 KB from node_modules and a few
    hundred lines from the lockfile.
  - **Kept, confirmed load-bearing:**
    - `motion` (motion.dev, framer-motion successor) — used by
      SwipeableCard, EntryFormPage animations, SettingsPage Reorder.
    - `@mui/x-data-grid` — used by ActionsPage + IdeasPage for the
      sort/filter-heavy tables. Already split into its own 650 KB
      chunk so it only downloads on those pages.
    - `recharts` — only used by InsightsPage. Kept for now (collapsing
      into visx would be a bigger rewrite than the audit warrants).
    - `@visx/brush` — scheduled for removal when item #3 drops the
      brush rail; the package stays until then.
  - **Chunking** already in good shape from earlier manualChunks split;
    no new bucket needed.

- **#1 Smarter cluster-threshold algorithm.** Commit `8c5bd60`.
  Replaced greedy left-to-right sweep with hierarchical-style
  clustering: start with every marker as its own cluster, merge the
  tightest pair until all gaps ≥ MIN_GAP. Threshold dropped to
  `DOT_R*2 + 6` since the algorithm no longer needs a safety buffer.
  Long chains of closely-spaced decisions now show as many points as
  the chart has room for; only genuinely crowded ones merge.


- Timeline decision-click banner lifted from in-plot floater to
  rounded-Paper overlay sitting precisely over the range-selector row.
  Commit `83d2ddb`.
- Decision-marker cluster threshold doubled (before the refinement
  planned in #1 above). Commit `c75c11d`.
- URL state system: `encodeUrlState` / `decodeUrlState` +
  `useEncodedUrlState` hook. Timeline wired for range / zoom / selected
  decision with base64-encoded `?s=` blob. Commit `a322d88`, race fix
  `1de8b47`, mount-reset fix `10c0dd9`, StrictMode fix `302a2d5`.
- Reminders drawer: restored stale-tickers, dropped Upcoming
  reminders section, scoped "Reminders" to past-due + next-7-days
  window. Commits `431719c` (initial), `945a5c4` (future-date render
  fix), `3fe25a0` (restored), `9573093` (window filter).
- Journal: single dense one-line rows, removed grid toggle, fixed
  Tags dropdown centring, polished mobile BottomNav typography. Commit
  `232099c`.
- AppBar shadow + BottomNav shadow + 6px scroll-jitter fix. Commits
  `dfb1e29`, `3cd0391`.
- Deep refactor batch: EditDecisionDialog wiring, inline decision log
  bar, marker colours → theme tokens, marker geometry to shared module,
  Vite manualChunks split, markdown-layer removal + migration script.
  Commits `fcdafe6`, `761c4a8`, `fcc8146`, `758214c`.
- Timeline mobile pass (earlier session): sticky title, default 6m
  range, cluster dots with count, "other" markers in top band,
  cluster-click zoom-to-split, friendlier Decisions-in-range list.
  Commit `c1b2f26`.
- Chart consolidation: one `TimelineChartVisx` rendering core used by
  timeline / popup / per-ticker pages. Commits `610ceb2`, `d38f651`.

---

*Whenever we finish an item, move it from Upcoming → Done with the
commit SHA so the log reads as real history rather than a todo list.*
