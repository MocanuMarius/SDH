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

## Still open / next round

- [ ] **Activity drawer** still uses pre-newspaper styling — has stale
  references to old chrome (deletes / archive / etc.). Audit + reskin.
- [ ] **Watchlist page** — never reviewed; likely needs the same PageHeader +
  EmptyState + MetricTile treatment.
- [ ] **Settings page** — same.
- [ ] **DecisionCard** (entry detail action cards) — visual hierarchy works
  but could use the new theme tokens more consistently. Worth a polish pass
  when we touch entry detail again.
- [ ] **`MetricCard` deprecation** — once we're confident `MetricTile` covers
  all use cases, delete `MetricCard.tsx` and switch every Analytics caller
  to import `MetricTile` directly.
- [ ] **Date inputs** — native `<input type="date">` is still the chunky OS
  widget in several forms. Either accept it or pull in MUI's
  `DatePicker` from `@mui/x-date-pickers`.

---

## Notes

- Once a fix lands and is verified in the preview, mark the box `[x]` and
  push. Don't batch fixes invisibly — keep the punch list honest.
- Add new issues here as they surface. The doc replaces ad-hoc TODO comments.
