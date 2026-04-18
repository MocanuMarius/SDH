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

> Last updated: 2026-04-18 (chart-fix + polish batch)

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

*Nothing explicitly queued. Next likely candidates: additional
TimelineChartCard wrapping (the Paper frame + decision banner still
live per-page), markdown-layer migration run (the DB-side strip; the
code is ready), broader InsightsPage / CalibrationDashboard polish.*

---

## Done (rolling log)

- **Chart-fix + polish batch (A–F).** Six-item sweep across the
  Timeline, per-ticker, and entry-detail pages, shipped as self-
  contained commits so each could be verified in the preview before
  the next landed.

  - **Y-axis geometry fix.** Commits `c9f0b44` (axis alignment) +
    `0286e8a` (`nice()` + padding). Root cause of the recurring "the
    chart is going below the y-axis" complaint was structural:
    `AxisLeft` / `AxisRight` were missing `top=responsiveMargin.top`
    so tick labels rendered 24 px above the gridlines + chart paths;
    `AxisBottom` unconditionally subtracted `BRUSH_HEIGHT` from its
    top, leaving the plot extending 40 px below the visible x-axis
    when `showBrush={false}`. Fixing both aligns every price label
    with the gridline it labels and no chart line ever visually
    crosses an axis label.

  - **A. Per-ticker page polish.** Commit `14753a3`. Replaced
    IdeaDetailPage's ad-hoc Breadcrumbs+chip header with
    `<PageHeader>` (sticky on mobile); moved the always-visible
    "Compare" chip strip behind a gear-icon `Dialog` on
    TickerTimelineChart (matching TimelinePage's pattern) with a
    compact "vs SPY" inline cue for active overlays; grouped the
    Decisions list into date sections with serif-bold relative
    buckets ("Yesterday" / "Over a month ago") primary + exact date
    secondary. Bucket helpers (`relativeBucket`, `formatDayHeader`)
    lifted to `utils/relativeBucket.ts` so Timeline and per-ticker
    share one source of truth.

  - **B. Desktop chart hover tooltip.** Commit `5341bc9`. Hover the
    price line → thin crosshair snaps to nearest data point, small
    Paper pill reads "Mar 4, 26 · $692.14" above the crosshair. Same
    affordance on both `/timeline` and `/tickers/:ticker` via the
    shared `HoverPricePill`. Caught + fixed an MUI footgun on the
    way in: `sx={{ width: 1 }}` is a *fraction* (100 %), not 1 px —
    both crosshair call sites now use `width: '1px'` with a comment.

  - **C. URL params consolidation.** Commit `cfe07b9`. Folded
    `?symbol=` / `?types=` / `?hideAutomated=` into the single
    `?s=<base64>` blob on TimelinePage. Old bookmarks self-migrate:
    one `useEffect` reads legacy keys, merges their values into the
    blob, strips them — all in a single `setSearchParams` call,
    because react-router doesn't compose two successive
    `.set(prev => ...)` updaters within the same tick (the second
    was clobbering the first's `?s=` write on the first attempt).

  - **D. Shared hover/measure overlays.** Commit `0ec3158`. Extracted
    the crosshair + hover-price pill + committed-measure stats pill
    duplicated across TimelinePage and TickerTimelineChart into one
    `ChartHoverOverlays` component. The full `TimelineChartCard`
    wrapper (Paper frame + decision banner + drag band) stays
    deferred — the drag-band has different impls on each page (ref-
    imperative vs React-state) for perf reasons the roadmap flagged.

  - **E. Markdown-layer cleanup.** Commit `9a9834d`. Sharpened the
    inline removal-checklist comment in `PlainTextWithTickers` —
    genuinely blocked on a DB-side migration run (the
    `strip-legacy-markdown` script requires service-role creds; anon
    key hits RLS and silently returns 0 rows, which I wasted time
    on before catching it). Code side is ready for removal as soon
    as the migration has been run against live data.

  - **F. Entry detail sticky header.** Commit `32bf8dd`. Swapped
    EntryDetailPage's ad-hoc Breadcrumbs + title/actions rows for
    `<PageHeader>`. Mobile title strip now sticks under the AppBar so
    the user always knows which entry they're reading mid-scroll.
    Edit / Remind me / Delete stay inline on desktop; a MoreVert
    overflow menu collapses them on mobile.

- **#8 Stale-idea resolve: dedicated lightweight dialog.** Commit `569298a`.
  **Audit findings**: the "Resolve" action on a stale-ticker card was
  opening the full OutcomeFormDialog — a 400+-line form with realised
  P&L, process score, outcome score, error-type checkboxes, post-mortem
  textareas, 500-word closing memo. For a ticker the user barely
  remembers that's noise — almost none of it is fillable, and the
  cognitive load of the form means the user closes it without saving.
  The existing pass-review swipe-action model (Correct / Missed / ???
  / +30d) is the right shape for this case.

  **Shipped**: new `ResolveStaleIdeaDialog` — 3 big verdict chips
  (Right / Wrong / Inconclusive) + optional 1-line hindsight note.
  Maps to the existing `outcomes` schema (outcome_score 5/1/3 +
  outcome_quality good/bad/null) so Insights + calibration reports
  keep updating. P&L, process score, post-mortem, memo all left null
  deliberately — anyone who needs that depth goes to the decision on
  ActionsPage + opens the full OutcomeFormDialog there.

  **Divergence**: ActionsPage and EntryDetailPage still use
  OutcomeFormDialog (closed trades with P&L; users there HAVE the
  context). ActivityDrawer's stale-idea "Resolve" swipe is the only
  consumer that dropped down to the simpler dialog.

- **#7 Extract shared chart components (partial).** Commit `1c06a27`.
  `src/components/charts/RangeSelectorButtons.tsx` (two variants:
  flat buttons for TimelinePage, outlined chip-tabs for
  TickerTimelineChart — same `value` / `onChange` API) +
  `src/components/charts/MeasureStatsPill.tsx` (drag-stats popup).
  Both consumed by TimelinePage + TickerTimelineChart; ~150 LOC of
  duplicated JSX + styling collapsed to single sources of truth. A
  full `TimelineChartCard` wrapper (owning Paper frame + drag overlay
  + decision banner) was deferred — layout margins + URL-state
  handshake make the lift non-mechanical.

- **#6 Desktop chart interactions.** Commit `42e98a8`.
  Three desktop fixes:
    - Wrapper cursor changed from `grab` (lying — there's no pan
      gesture) to `crosshair`. Decision markers carry their own
      `cursor: pointer` inside the chart SVG so they read as clickable.
    - `touchAction: 'none'` was breaking native mouse-wheel scroll over
      the chart area on desktop. Now applied only at xs/sm breakpoints
      where pinch-zoom needs it; md+ uses `auto` so wheel scrolling
      passes through to the page.
    - Measure-drag activation threshold raised 10 → 20 px so a normal
      click (small tremor) doesn't accidentally fire a measurement.
      Deliberate drags still trigger normally.
  The deeper hover-tooltip-along-the-line affordance many charting libs
  ship by default is left as a follow-up — not blocking basic usability.

- **#5 Chart settings modal.** Commit `7b563ac`.
  Retired the outer filter bar entirely (Benchmark dropdown, Show-decisions
  Select, Hide-broker-imports chip). Range presets stay visible at rest
  inside the chart's top control row. Added a `<TuneIcon>` gear button in
  the same row (right side, next to the conditional Reset-zoom button)
  that opens a Dialog holding:
    - Benchmark dropdown
    - Show-decisions type filter
    - Broker-imports toggle
    - Custom date range (From / To) — also moved off the always-visible
      toolbar.
  Chose the toolbar-row gear over a plot-anchored bottom-right FAB:
  less visual noise when the chart is busy, and it sits where the
  eye already is while adjusting range presets. Same URL-param wiring
  so deep-links unchanged.

- **#4 Decisions-in-range date header restyle.** Commit `50e341c`.
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
