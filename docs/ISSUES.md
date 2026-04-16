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

## Notes

- Once a fix lands and is verified in the preview, mark the box `[x]` and
  push. Don't batch fixes invisibly — keep the punch list honest.
- Add new issues here as they surface. The doc replaces ad-hoc TODO comments.
