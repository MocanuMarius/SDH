# Deecide — Principles & Direction

A living doc of how the user wants this app to evolve. Written as we work,
updated as new preferences emerge. Future iterations should respect these so
the app stays coherent.

> Last updated: 2026-04-17

---

## Mental model

- **A Ticker is the first-class citizen.** Every decision, feeling, prediction
  ladders up to a ticker. Pages and analytics should make that obvious.
- **A Journal Entry is a moment of thinking.** It can contain 0–N decisions.
  It is plain prose, not a structured form.
- **A Decision is a structured action.** Buy / Sell / Pass / Hold / Research /
  Watchlist / Speculate / Trim / Cover / Add more. Every decision must identify
  its ticker. A decision can stand alone (no entry); an optional `notes` field
  is the maximum context that lives on a standalone decision.
- Once created, **decisions don't move between entries** — if you want to
  associate one with an entry, just log a new decision from inside that entry.

## Data behaviour

- **Plain text, never markdown.** Users should not see or have to know about
  `**`, `###`, `>`. Body content is plain paragraphs; `$TICKER` auto-linkifies
  on render only.
- **Orphan, don't cascade.** Deleting a journal entry must not erase the
  decisions inside it — they become standalone. The historical fact stands.
- **One-time migrations are fine.** Don't drag legacy shapes forward; clean up
  with a script when the model improves.
- **Newest first** for time-series views (decisions list, entries list, etc.).

## UX rules

- **Concrete over generic.** No inline "Tip:" / "Add X to enable Y" helper
  text that pushes the layout around. Disabled buttons are enough.
- **One editor per concept.** Editing an entry doesn't edit its decisions, and
  vice-versa. Each gets its own focused surface.
- **Progressive disclosure.** Hide the rare/optional behind `+ Add X`. Default
  to the common case (e.g. "Decision taken today" checked, expand only if
  changing the date).
- **Tags are chips, not buttons.** Selectable groups use MUI Chip filled/outlined,
  not button variants.
- **No author / "x days ago" chrome** in detail views unless it's load-bearing.
- **Inter-decision deltas** are high-value. On a Ticker page, between any two
  decisions show the price change in % over the elapsed time — the story of
  what happened in between.
- **Side-by-side fields must match heights.** Type + Ticker, etc.
- **Auto-fill from context.** A decision form opened inside an entry whose
  title contains `$UBER` should pre-fill ticker = UBER.

## Visual direction

The newspaper aesthetic is now **encoded in the theme** — see [src/theme.ts](../src/theme.ts).
Notes for future iterations:

- **Background**: warm paper `#fbfaf6`. White (`#ffffff`) reserved for active
  surfaces (open cards, popovers, dialogs). Subtle `#f4f1ea` for collapsed
  cards and table headers.
- **Typography stack**: **Source Serif 4** for `h1`–`h4` display headings;
  **Inter** for body and UI; **JetBrains Mono** for numbers (apply `className="mono"`
  or `fontFamily: fontMono` for tabular figures).
- **Palette**: deep newspaper-section blue `#1e40af` as the single accent.
  Conventional muted green/red for P&L. No gradients, no drop shadows on
  default surfaces.
- **Hairlines, not boxes.** `Paper variant="outlined"` is a 1px `divider`
  hairline, no shadow. Elevated dialogs/popovers get a soft shadow only.
- **Avoid washed-out white-on-white.** Cards on a white page need either a
  subtle background, a hairline, or a clear left accent — not all three at
  once and not none.
- **Visual hierarchy matters.** Page titles should be real `h1`-scale (serif),
  not `subtitle1`. Section labels use the new `overline` variant (uppercase,
  letter-spaced, 700-weight).
- **Primary actions look primary.** A `+ Decision` inside an editor is a
  primary action — it should not look like a quiet text link. Reserve
  `text` button styling for de-emphasised actions.
- **One accent colour** for primary CTAs and selected states; everything else
  is greyscale + hairlines.

## Active priorities (rolling)

1. **Structural rebuild** of the entry/decision split — Step 1 (DB migration) ✅
   applied; Step 2 (strip markdown from editor) ✅; markdown splice removed; remaining
   `MarkdownRender` call sites swapped to `PlainTextWithTickers`.
2. **UI/contrast cleanup** ✅ first pass: editor header simplified, row cards
   tinted-when-closed, page titles bumped, primary CTA hierarchy restored.
3. **Newspaper theme** ✅ first pass: serif display headings, paper background,
   hairline cards, deep-blue accent, mono numerals, Source Serif 4 + Inter +
   JetBrains Mono loaded via Google Fonts.
4. **Motion**: subtle `motion/react` animations for the pending-decisions chip
   strip. More can come — page transitions, count-up for delta pills, hover
   lifts on Ticker rows.

### Still open from rebuild plan
- Step 3: dedicated `EditDecisionDialog` for editing a single decision row.
- Step 5: inline log-decision bar at the top of each Ticker page.
- Step 6: global `+ Log decision` button in the top nav (for standalone decisions).
- Step 7: one-time migration script to parse legacy markdown decision blocks in
  existing entry bodies and promote them to structured `actions` rows.
  **Transitional palliative in place**: `PlainTextWithTickers` strips leftover
  markdown markers (`#`, `**`, `>`, `-`) at render time so legacy content reads
  cleanly. Drop that strip once the migration runs.
- Step 8: ✏️ on existing entry decision cards opens the new `EditDecisionDialog`.

## Round 2 UI polish (2026-04-17)

- **Masthead**: `Deecide` wordmark set in Source Serif 4 with an "Investment
  Journal" all-caps kicker beneath on desktop. Newspaper-y.
- **Desktop nav**: section labels are now ALL CAPS, letter-spaced, muted-white
  with a hairline underline on the active route.
- **Mobile bottom nav**: theme-token background (`text.primary` ink-black),
  ALL CAPS labels, white-on-bold for the selected tab, no hardcoded colours.
- **Entry detail header buttons**: real hierarchy now — `Edit` is filled
  primary, `Remind me` is outlined, `Delete entry` collapses to a quiet icon
  (hover-only red tint).
- **Ticker chips** are visually consistent across `PlainTextWithTickers`,
  `MarkdownRender`, and `TickerLinks` — same blue tint, same border, same
  weight. Standalone `MarkdownRender` is now used in two spots only and is
  scheduled to be deprecated entirely.
- **Legacy-markdown stripper** in `PlainTextWithTickers`: hides leftover
  `###` / `**` / `>` / `-` markers from old entries so they read like prose.

## Things explicitly rejected

- Markdown syntax in user-facing input.
- Risk Limit / Profit Target as separate trading-plan fields. Dropped — not
  useful in practice.
- Cascading delete of decisions when entry is deleted. Always orphan.
- Modal dialog as the way to log a decision from a Ticker page. An inline log
  bar in context is preferred where the ticker is obvious.

## Open questions

- Real-time multi-tab sync (broadcast channel / Supabase realtime) — flagged
  but deferred.
- Should standalone decisions surface in the Journal list? (Today only entries
  show there.) TBD.
- WYSIWYG bold/italic toolbar on the entry body — not now, possibly later.

---

*Update this file whenever the user expresses a new preference, rejects a
direction, or sharpens an existing principle. Leave the date stamp at the top.*
