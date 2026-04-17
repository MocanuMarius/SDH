# Open Issues — tracking

Live punch list of issues called out by the user. Cross items off as they
land. Reorder if priority shifts.

## Round 3 — 2026-04-17

### Data freshness / stale-data sync
- [x] **`/actions` (Trades) doesn't reflect freshly-created decisions.** Root
  cause: the global React-Query `staleTime` was 30 s, so any cached query
  served stale data for 30 s after a mutation even with proper invalidation.
  Fixed in `src/main.tsx`: `staleTime: 0` + `refetchOnMount: 'always'`.
- [x] **`/decisions` (Long-term horizons) is empty** by design — only entries
  with an explicit `decision_horizon` date appear. Empty state was confusing.
  Improved to explain what gets here and how to add one. (Page intent kept.)
- [x] **`/analytics` Overview tab disconnected** — was a manual `useState` +
  `useEffect` fetch, never re-ran on mutations. Wired to react-query with
  `['analytics', 'snapshot', filter]` key. `invalidate.actions/entries/outcomes`
  now also invalidate `['analytics']` so the overview always reflects the
  latest data.
- [ ] **Single source of truth + multi-tab realtime sync.** With staleTime: 0 +
  refetchOnMount, in-app freshness is fixed. Multi-tab realtime (Supabase
  `.on('postgres_changes', ...)`) still TODO — a separate, larger lift.

### Markdown
- [x] **Markdown still visible** root cause: the editor shows the raw stored
  body, including legacy `###`/`**`/`>` markers. Fixed two ways:
  (a) extracted `stripLegacyMarkdown` into a shared util,
  (b) entry form now strips on save so the next persist cleans the source,
  (c) renderer also strips at render time so the detail view always reads
  cleanly. Combined, legacy markdown decays to zero as users edit entries.
- [ ] **Bulk one-shot SQL migration** to clean every existing entry's
  body/title server-side (so we don't have to wait for each entry to be
  edited). Will write next.

### Timeline
- [ ] **Pass / Research / Hold / Watchlist decisions** — diamond renderer in
  TimelineChartVisx is still wired (line 619). Need to verify with a real Pass
  decision in the data. To verify next.

### Workflow process
- [x] Memory entry: after each batch → lint → commit (loose message) → push
  to trigger auto-deploy. ([feedback_workflow_lint_commit_push.md](../../C:/Users/mocan/.claude/projects/F--Vibecode-StockDecisionHelper/memory/feedback_workflow_lint_commit_push.md))

---

## Round 4 — 2026-04-17 (later)

### Design system primitives extracted
- [x] **PageHeader, SectionTitle, EmptyState, StatusChip, MetricTile** in
  `src/components/system/`. Covers the 90% of repeated page-level patterns.
  See [docs/PRINCIPLES.md](PRINCIPLES.md) for usage guidance.
- [x] Pages refactored to use the primitives: Tickers, Trades, Long-term
  horizons, Timeline, Analytics, Ticker detail (status chip), Journal,
  EntryForm.
- [x] `MetricCard` (legacy) now delegates to `MetricTile` so existing
  Analytics dashboard tiles pick up the newspaper styling without API churn.

### Cross-tab realtime sync
- [x] `useRealtimeSync` hook subscribed to `postgres_changes` for actions,
  entries, outcomes, passed, predictions, feelings, reminders. Wired in
  `AppLayout`. SQL to enable Supabase realtime publication shipped at
  `supabase/migrations/20260417130000_enable_realtime.sql` (user applied).

### Calibration tab
- [x] Wired to react-query (`['analytics', 'calibration']`). Predictions
  invalidations bubble through.

### Bulk markdown cleanup
- [x] One-shot SQL migration `20260417120000_strip_legacy_markdown.sql`
  applied. Source-of-truth on disk is now plain text; the render-time
  stripper in `PlainTextWithTickers` is now a belt-and-braces fallback.

---

## Round 5 — 2026-04-17 (later)

- [x] **Activity drawer** — header now uses the serif `h4` "Activity",
  section labels via `SectionTitle`, all-clear empty state via `EmptyState`.
- [x] **Watchlist page** — `PageHeader` with dek explaining what it is.
- [x] **Settings page** — same.
- [x] **DecisionCard** — date moved into the header row next to the type
  chip (less visual noise), redundant "Decision" label removed.
- [x] **Import + Practice (SkillEngineering) pages** — `PageHeader` with deks.
- [x] **`MetricCard` deleted** — every caller now imports `MetricTile`
  directly. One source of truth for the metric primitive.

## Still open

- [x] **Date inputs** — native `<input type="date">` kept per user instruction
  (round 6 flow audit answer #4: "Keep native"). Inputs' surrounding buttons
  (Today/Yesterday/+1w/+1m quick picks) polished on the Add action dialog.

---

## Round 6 — flow audit findings (2026-04-17)

Full walkthrough lives in [FLOW_AUDIT.md](FLOW_AUDIT.md). This is the punch
list extracted from it, in priority order.

### Clear fixes — no input needed
- [x] **F2 fixed — edit affordance on each `DecisionCard`.** ✏️ IconButton
  opens the focused ActionFormDialog in edit mode; initial prefill synced via
  `useEffect` on `[open, initial]`.
- [x] **F4 fixed — two paths to log a standalone decision.** Global
  `+ Log decision` IconButton in the AppBar (no pre-fill) plus a
  `Log decision` button on the Ticker detail page (pre-fills ticker). Both
  reuse `ActionFormDialog`.
- [x] **F3 fixed — Outcome dialog now surfaces errors inline.** `outcome_date`
  defaults to today; submit errors render in a red `<Alert>` above the dialog
  actions instead of throwing silently. Root cause of the silent failure was
  schema drift — catch-up migration
  `20260417150000_outcomes_catchup_columns.sql` re-adds the missing columns.
- [x] **F8 fixed — Calibration tab EmptyState** rendered when
  `totalPredictions === 0`.
- [x] **F7 — Long-term horizons EmptyState** is good; kept as-is.

### Chart polish — clear
- [x] **TickerTimelineChart responsive margins** — `plotLeft` 48/36,
  `plotRight` 20/12, `plotBottom` 48/40 per `isMobile` branch.
- [x] **TickerTimelineChart axis font sizes** — `axisFontSize` now
  `isMobile ? 10 : 11`.
- [x] **TickerTimelineChart x-axis height tightened** — dropped from 80 →
  `isMobile ? 44 : 56`; the label rotation still 45° (works fine at the new
  height).
- [x] **TimelineChartVisx arrow geometry scales on xs** — `getArrowGeom(width)`
  produces a 15%-smaller variant under 480px, including a smaller count-label
  font (13 → 11).

### IA / wayfinding — needs your call
- [ ] **Timeline vs Ticker page overlap.** Recommendation: keep both;
  shrink the Ticker page chart to a "preview" with a strong CTA to the
  Timeline. Or merge as you prefer. **Needs input.**

### Data / schema — needs your call
- [x] **F9 resolved — `entry_feelings` removed.** User confirmed dead.
  Feelings tab, `FeelingCard`, `FeelingFormDialog`, `feelingsService`, query
  hooks, Ctrl+Shift+M shortcut and realtime subscription all deleted. Drop
  migration `20260417140000_drop_entry_feelings.sql` queued for user to run.
- [x] **F10 resolved — Watchlist is fine.** Diagnostic SQL probed the wrong
  table name (`public.watchlist` vs real `watchlist_items`/`_alert_history`/
  `_audit_log`). `docs/WATCHLIST_DIAGNOSTIC.sql` updated. Page verified live
  with 7 active items + 1 triggered.

### Lower-priority polish
- [ ] **Sharpen Calibration / Overall analytics copy** once predictions exist.
  (Still pending — waiting on real prediction data.)
- [x] **Decision card left-border colour** — verified. `DecisionCard` pulls
  `getDecisionTypeColor(action.type)` into a 3px left border, matching the
  Timeline diamond colours.

---

## Round 7 — Pixel 8 audit (2026-04-17 evening)

Emulated Pixel 8 viewport (412×915) and walked every page.

- [x] **iOS-style scrollbars** — thin, translucent, rounded thumbs globally
  via `theme.ts` MuiCssBaseline overrides (`scrollbar-width: thin` +
  `::-webkit-scrollbar` rules).
- [x] **Trades (`/actions`) DataGrid no longer horizontally clips.** On mobile
  (`<md`) the columns shrink (Type 88, Symbol 92, Date 84, Add outcome 88)
  and cell padding drops from 10→6px. Research chip still reads; dates keep
  "X months ago" readable.
- [x] **Analytics → Performance tables no longer push the page.** The
  "Reason comparison", "Reason opportunity return (passed)", and
  "Reason opportunity return (closed)" tables are now wrapped in a
  `Box sx={{ overflowX: 'auto' }}` so wide tables scroll inside their Paper
  instead of forcing body horizontal scroll.
- Verified all other major routes at 412×915: Journal (grid + list), Tickers
  list, Ticker detail (TSLA, MTX.DE — chart compact + CAGR visible), Timeline
  (arrows now smaller at xs), Entry form, Entry detail, Watchlist,
  Analytics Overview / Calibration, Long-term horizons, Settings, Import
  (Broker / CSV / IBKR), Practice, MORE drawer, Add-action dialog. No
  horizontal scroll on any of them.

---

## Notes

- Once a fix lands and is verified in the preview, mark the box `[x]` and
  push. Don't batch fixes invisibly — keep the punch list honest.
- Add new issues here as they surface. The doc replaces ad-hoc TODO comments.
