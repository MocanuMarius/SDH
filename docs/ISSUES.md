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

- [ ] **Date inputs** — native `<input type="date">` still in several forms.
  Deferred unless asked for `@mui/x-date-pickers`.

---

## Round 6 — flow audit findings (2026-04-17)

Full walkthrough lives in [FLOW_AUDIT.md](FLOW_AUDIT.md). This is the punch
list extracted from it, in priority order.

### Clear fixes — no input needed
- [ ] **F2 broken — no edit affordance for a decision.** Add a focused
  `EditDecisionDialog` and put a ✏️ on each `DecisionCard` so the user can
  change type / ticker / date / price / reason / notes without re-editing
  the whole entry. (Step 3 of the rebuild plan, never landed.)
- [ ] **F4 broken — no UI to log a standalone decision.** Add a global
  `+ Log decision` button in the AppBar (no pre-fill) AND an inline log bar
  on the Ticker page (pre-fills ticker). Both reuse the same form. (Steps 5
  and 6 of the rebuild plan, never landed.)
- [ ] **F3 awkward — Outcome dialog submit silently fails.** Default
  `outcome_date` to today; surface validation errors visibly when the user
  clicks Add and a required field is missing.
- [ ] **F8 — Calibration tab needs a real EmptyState** when there are no
  predictions. Today it renders blank cards.
- [ ] **F7 — Long-term horizons EmptyState** is good; no further fix needed
  unless the page is to be merged elsewhere.

### Chart polish — clear
- [ ] **TickerTimelineChart hardcoded margins** ([file:line](../src/components/TickerTimelineChart.tsx#L859))
  → extract `getTickerChartResponsiveMargin(width)`, mirror what the visx
  version does. Shrink left margin to 40 on mobile.
- [ ] **TickerTimelineChart axis font sizes hardcoded 13px** → use
  `isMobile ? 11 : 13` (mirror the visx version).
- [ ] **TickerTimelineChart x-axis 80px tall + −45° fixed rotation** → drop
  to ~64px and tilt to −60° on xs widths.
- [ ] **TimelineChartVisx arrow geometry doesn't scale** on xs — derive AW /
  AH / SW / SH from a base unit and shrink ~15% on xs.

### IA / wayfinding — needs your call
- [ ] **Timeline vs Ticker page overlap.** Recommendation: keep both;
  shrink the Ticker page chart to a "preview" with a strong CTA to the
  Timeline. Or merge as you prefer. **Needs input.**

### Data / schema — needs your call
- [ ] **F9 — `entry_feelings` table is empty across the DB** but a "Feelings"
  tab still renders on every entry. The Market Sentiment slider writes to
  `entries.market_feeling`, not this table. Is `entry_feelings` dead? Should
  the tab go? **Needs input.**
- [ ] **F10 — Watchlist count returns null** from a direct supabase query —
  table may not exist or RLS is blocking. WatchlistPage works in the UI
  though. Worth a deeper look. **Needs input or deeper investigation.**

### Lower-priority polish
- [ ] **Sharpen Calibration / Overall analytics copy** once predictions exist.
- [ ] **Decision card** could pick up a small per-type left-border colour
  treatment to match the Timeline diamond colours (already done — verify).

---

## Notes

- Once a fix lands and is verified in the preview, mark the box `[x]` and
  push. Don't batch fixes invisibly — keep the punch list honest.
- Add new issues here as they surface. The doc replaces ad-hoc TODO comments.
