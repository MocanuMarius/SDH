# Flow audit — 2026-04-17

Live walkthroughs of real user flows against the running app. Each flow records
what I tried, what happened, and whether it worked. Items flagged **broken** /
**weird** / **confusing** feed back into [ISSUES.md](ISSUES.md).

Test user: `mariushtcwild@gmail.com`

Legend:
- ✅ works as expected
- 🟡 works but awkward — UX / copy / missing affordance
- ❌ broken — doesn't do what a reasonable user would expect
- ❓ unclear — need user input to decide

## Data shape baseline (sampled live)

| Table | Count | Note |
|---|---|---|
| `actions` | 501 | Mostly IBKR auto-imports + 3 promoted from legacy markdown |
| `outcomes` | 284 | Mostly auto-attached to broker fills |
| `entries` (manual) | 143 | Filtered out 'Automated'/'IBKR'-tagged auto entries |
| `entries.decision_horizon NOT NULL` | **0** | Long-term horizons page is empty by data, not code |
| `entry_predictions` | **0** | Calibration has nothing to score |
| `entry_feelings` | **0** | "Set sentiment" UI seems to update `entries.market_feeling`, not this table |
| `passed` | many | NRP, IESC, OTCM samples |
| `reminders` (open) | 2 | Activity drawer has content |
| `actions.entry_id IS NULL` | **0** | No standalone decisions exist yet — UI doesn't expose creation path |

---

## Flows tested

### F1 — Create entry → log decision → save ✅
Created `Flow-test $FLOWTEST` with body, `+ Add decision` opened the inline
form, ticker pre-filled from title (good), reason "flow-audit", submitted with
`Insert into body`, then `Create entry`. Result: entry persisted, an `actions`
row was created (Buy $FLOWTEST), body_markdown is **clean** (no markdown
splice). The auto-promote pipeline works end-to-end.

### F2 — Edit a decision from the entry detail ❌ broken
Opened the new entry's detail page, looked at the Actions tab. The decision
card shows **only** "Add outcome" and a delete (trash) button; there is **no
edit** button on the action card itself. The promised dedicated
`EditDecisionDialog` (Step 3 of the rebuild plan) was never wired up.
**Fix:** Add an `EditDecisionDialog` and put a ✏️ on each action card.

### F3 — Add outcome to a decision 🟡 awkward
Clicked "Add outcome", dialog opened with Result / Realized P&L / Date /
Notes / Process×Outcome. Filled the first text input ("125.50") and clicked
the submit-typed "Add" button (and `form.requestSubmit()` as a fallback). The
dialog **did not close** and **no row was inserted** in `outcomes`. No console
error. Likely a silently-failing required-field validation.
**Fix:** Surface validation errors visually; default `outcome_date` to today
so the form is submittable with just a P&L + outcome date.

### F4 — Standalone decision (no entry) ❌ broken
Schema supports `entry_id` nullable (migration applied). DB has 0 standalone
rows. The UI has no way to create one — there's **no global "+ Log decision"
button** in the AppBar and **no inline log bar** on the Ticker page (Steps 5
and 6 of the rebuild plan never shipped).

### F5 — Delete entry orphans its decisions ✅
Deleted the F1 entry. Action row's `entry_id` flipped to `null`, action still
visible on `/tickers/FLOWTEST`. The orphan-on-delete behaviour from the
`actions_standalone` migration works as intended.

### F6 — Ticker page handles unknown ticker gracefully ✅
`/tickers/FLOWTEST` correctly shows "No chart data … Decisions table below is
still available". No crash, no blank screen. Status chip ("Holding") and
header summary work even with no chart.

### F7 — Long-term horizons page is empty 🟡
Page renders the new EmptyState with a clear "+ New entry" CTA. But the data
is empty *by design* (no entries have `decision_horizon` set). Maybe the
page's intent isn't useful enough to keep around if no one sets horizons.

### F8 — Calibration tab with no predictions 🟡
Calibration uses `entry_predictions`. There are **0** predictions in the DB.
The page renders cards with placeholder/empty values. Need a proper
EmptyState that explains "no predictions to calibrate yet — add one to an
entry via + Add prediction".

### F9 — Feelings tab on entry detail ❓
"Feelings (0)" tab is always 0 because `entry_feelings` table has 0 rows
across the entire DB. But the Market Sentiment slider in entries does work —
turns out `entries.market_feeling` is a column on entries, not a row in
`entry_feelings`. The "Feelings" tab is wired to the wrong source OR was
never used.
**Needs input:** is `entry_feelings` a dead table?

### F10 — Watchlist visibility ❓
`watchlist` table query returned `null` count. Either the table doesn't exist
under that name, or RLS is blocking, or the page lazy-creates it. The
WatchlistPage works but DB queries from the preview return null.
**Needs input or deeper look.**

### F11 — Ticker chip → /tickers/X ✅
Clicking the `$TICKER` chip in entry body navigates correctly with the new
`/tickers/` route.

### F12 — Markdown rendering ✅
Legacy markdown markers in old entries (e.g. `### Research Decision … **$X**`)
are stripped at render time. Strip-on-save also active. Bulk SQL migration
already applied by the user.

---

## Chart audit — TickerTimelineChart (Recharts)

From explorer agent + my checks:

- ❌ **Hardcoded chart margins** ([TickerTimelineChart.tsx:859](../src/components/TickerTimelineChart.tsx#L859))
  `margin={{ top: 24, right: 24, left: 52, bottom: 60 }}`. On a 360px-wide
  mobile viewport, the 52px left + 24px right = 76px lost to chrome — plot
  area is cramped.
- ❌ **No responsive font sizing** for axes (Y-axis is 13px regardless of
  width). The visx version (`TimelineChartVisx`) already uses
  `isMobile ? 11 : 13`.
- ❌ **X-axis bottom band 80px** (`height={80}` on AxisBottom). Too much
  vertical real estate, especially on small charts.
- 🟡 **Hardcoded `-45deg` x-tick rotation**; should bump to `-60deg` on xs
  widths to fit more dates.
- 🟡 **No min-width protection** on `innerWidth` — could go below 200px on
  very narrow viewports.

## Chart audit — TimelineChartVisx (visx)

- ✅ Already responsive: margins shrink on `width < 400` (left → 40, right →
  16), font sizes follow `isMobile`, tick count adapts.
- 🟡 Arrow-marker geometry magic numbers (AW=22, AH=14, …) don't scale with
  viewport. On xs they look chunky.
- 🟡 Fixed breakpoints `400 / 600` aren't aligned with MUI theme breakpoints.

## Timeline vs Ticker page IA

Both render decisions on a price line. They're not redundant — they answer
different questions:

- **Timeline** = "How did all my decisions perform vs the market?" Multi-ticker
  overlay, benchmark comparison, zoom/brush, keyboard nav.
- **Ticker page** = "How did I do on *this* stock, and what if I'd acted
  differently?" Counterfactual P&L, per-decision delta table, valuation
  widget, focused single-ticker context.

**Recommendation (from agent):** keep both. Sharpen the wayfinding:
- Ticker page chart can shrink to a smaller "preview" with a strong CTA
  "→ See in full timeline (zoom, overlay, benchmark)".
- Timeline page dek already says "For one ticker's full history, open its
  Ticker page" — fine.

The user can override this if they want one of them deleted. **Needs input.**
