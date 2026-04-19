# Flow audit

Live walkthroughs of real user flows against the running app. Each flow records
what I tried, what happened, and whether it worked. Items flagged **broken** /
**weird** / **confusing** feed back into [ISSUES.md](ISSUES.md).

Newest pass at the top — older notes preserved for reference.

---

## 2026-04-19 — full-coverage sweep (≥ 15 flows)

Sweep across every reachable page + the major dialog/drawer states,
chasing two questions: "is anything broken?" and "what reads as
cruft we could remove?" The 20 flows below cover every routed page
at least once, plus the dialogs/drawers that aren't routes. Mobile
viewport, logged-in account, real data.

### Flows walked

| # | Flow | Route(s) hit | Status |
|---|---|---|---|
| 1 | Login screen | `/login` (anon redirect) | ✅ |
| 2 | Journal browse — list, filter chips, search | `/` | ✅ after fix #1 below |
| 3 | New entry — empty form, progressive disclosure | `/entries/new` | ✅ |
| 4 | Entry detail — view existing entry + decision + reminder | `/entries/:id` | ✅ after F.commit (sticky PageHeader) |
| 5 | Entry edit — modify title + market sentiment + save | `/entries/:id/edit` | ✅ |
| 6 | Tickers list — sortable/filterable, click into one | `/tickers` | ✅ (see O-1) |
| 7 | Per-ticker detail — chart, hover pill, gear modal, decisions table grouped by date | `/tickers/:ticker` | ✅ after A+B commits |
| 8 | Timeline — range dropdown, gear modal, decision marker click, measure-drag | `/timeline` | ✅ after Y-axis + dropdown commits |
| 9 | Trades / Actions list — table, type filter, ticker filter | `/actions` | ✅ after fix #2 below |
| 10 | Analytics → Performance — KPIs, Activity rollups, heat map | `/analytics` | ✅ after dedup commit |
| 11 | Analytics → Calibration — empty state | `/analytics/calibration` | ✅ (genuinely empty data, see O-3) |
| 12 | Watchlist — Active + Triggered tabs, search, add | `/watchlist` | ✅ |
| 13 | Import → Broker step 1 (broker picker) | `/import` (Broker tab) | ✅ |
| 14 | Import → CSV tab + IBKR History tab | `/import` (other tabs) | ✅ |
| 15 | Settings — three preset sections | `/settings` | ✅ (sparse but functional) |
| 16 | Practice / Skill engineering | `/skill-engineering` | ✅ but see L-1 |
| 17 | App-bar hamburger nav drawer — every link reachable | (chrome) | ✅ |
| 18 | App-bar reminders bell → ActivityDrawer | (chrome) | ✅ |
| 19 | InlineDecisionBar log on per-ticker page | within #7 | ✅ |
| 20 | Chart settings modal (gear) — both pages | within #7 + #8 | ✅ after C commit |

### Fixed in this sweep

1. **Legacy markdown in journal titles** — `EntryListPage` rendered
   `entry.title_markdown` raw, so historical entries with titles like
   `` `#research` `` / `` `#VC` `` showed the literal backticks in
   the list. Body-text path already cleans via `stripLegacyMarkdown`;
   titleProse now does too. Commit `7a68d70`.

2. **Trades Date column truncation** — Mobile column width was 84 px,
   which clipped labels longer than ~10 chars ("3 months ago" → "3
   months a…"). Bumped to 108 px. Commit `7a68d70`.

3. **Analytics duplicated rollup blocks** — "Last 4 weeks" + "All
   time" rendered TWICE on the Performance tab. Same numbers, slightly
   different visual styling. Dropped the first occurrence.
   Commit `c761a4b`.

### Open / needs follow-up

- **O-1.** `$DR` and `$MFCSF` both display as "Medical Facilities Cor"
  on the Tickers list (one truncated, one is the real company name).
  `$MFCSF` — *Medical Facilities Corp* — is correct; `$DR` looks
  like it inherited the same label by accident from the company-
  lookup path. Likely a `normalizeTickerToCompany` collision; needs
  a data check, not a UI fix.

- **O-2.** Markdown DB migration still pending. The render-time
  strip on `PlainTextWithTickers` keeps things looking clean, but
  underlying rows still hold legacy markers. Fix path documented
  in `PlainTextWithTickers` + roadmap (run
  `npm run strip:legacy-markdown` with service-role creds; anon key
  hits RLS).

- **O-3.** Calibration tab on `/analytics/calibration` shows
  "No predictions to calibrate yet" but the user has 1 prediction
  on file (visible on entry detail). Predictions need RESOLVED
  outcomes to surface here — empty-state copy is technically right
  but reads as if the prediction itself is missing. Could clarify
  to "No resolved predictions yet — your active prediction will
  show here once its by-date passes."

- **O-4.** Filter chip labels on Journal list are cryptic
  ("S 0  M 45  I 1") — Status / Memo / Idea? Hover/long-press shows
  no tooltip. Worth a tooltip pass or fuller labels on first render
  with a "compact" toggle.

### Low-ROI removal candidates

Each item is a feature that surfaces in nav or page chrome but
appears unused / under-used / superseded by another feature. None
have been auto-removed — listed here so the user can decide.

- **L-1. Practice / SkillEngineeringDashboard.** Routed at
  `/skill-engineering`, surfaces in the hamburger nav as "Practice".
  Page renders an empty state ("No resolved sub-skill predictions
  yet") for a flow that requires a non-trivial prediction-resolution
  pipeline that the rest of the app doesn't actively feed. If the
  practice/Brier-score loop never got operationalised, this nav
  entry + ~370 LOC page could go and Calibration tab could surface
  the same data in one place.

- **L-2. `Tags` dropdown on Journal list.** Visible chip-style
  dropdown next to the filters; clicking it pops a multi-select of
  every tag in the journal. The four status-toggle chips next to it
  ("All 50  S 0  M 45  I 1  Hide automated") already cover most of
  what users filter on; the Tags dropdown rarely earns the screen
  real estate. Could move into a "More filters" expander.

- **L-3. CSV import tab (`ImportPage.tsx`).** ImportHub has three
  tabs: Broker (multi-step wizard) / CSV (this) / IBKR History.
  The IBKR import via the Broker wizard already supports CSV-shaped
  inputs; the standalone CSV tab is a thinner version of the same
  thing. Likely deletable once Broker covers the CSV use case.

- **L-4. `entries/:id/edit` Decisions section.** The collapsed
  "Decisions" Paper at the top of the form is a stub (nothing
  renders inside) — actual decision logging happens via the
  per-ticker Inline bar or the `+ Add` button in the Actions tab on
  the entry detail page. The form's section is a dead-end. Could be
  removed entirely; users who land here looking for decision-editing
  would be better served by a "Manage decisions →" link to the
  entry detail page.

- **L-5. Mobile FAB on Journal list.** The blue floating-action
  pencil at the bottom-right duplicates the "+ New" button in the
  PageHeader actions slot. On mobile the PageHeader button is
  visible-from-top so the FAB isn't covering a missing affordance.
  Two new-entry buttons on the same screen is noise; pick one.

---

## 2026-04-17 — initial pass

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
