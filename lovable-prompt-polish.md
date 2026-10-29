# PARITY — visual polish pass (paste as-is into Lovable)

Keep all existing routes, state, backend integration, and API calls exactly as they are. **This is a visual-only pass.** Do not touch the n8n webhook call, the data parsing, or any business logic.

## Bug fix first (do this regardless of anything else below)

Anywhere the text `CONDITIONAL ,Äî RE-TRADE` (or any `,Äî` / `‚Äî` sequence) appears — in `verdict`, `verdictNote`, or the sample fixture — it is corrupted mojibake for an em dash (—). Search the whole codebase (including `src/fixtures/sampleDeal.ts` if it exists) and replace every corrupted sequence with a clean `—` character. Verify by rendering the Deal Score card and confirming it reads `CONDITIONAL — RE-TRADE` with a proper em dash, not garbled characters.

## The problem

The app currently renders as a plain, flat, generic SaaS dashboard — white cards, thin grey borders, default shadows, no depth, no motion, no visual identity. It looks like a wireframe, not an institutional-grade product. This needs to look like something a CBRE VP would trust with a nine-figure decision, not a template.

## Apply the real design system (this was speced before but never actually applied — apply it now)

**Background:** replace the flat white page background with a **dark, deep, rich charcoal/navy** (`#0F172A` → `#1E293B` gradient), not white `#F8FAFC`. Subtle ambient gradient drift, very slow, barely perceptible — never distracting.

**Cards:** on the dark background, cards are the light surfaces — `#FFFFFF` with a hard, offset, solid drop shadow (not a soft blur — a crisp shadow offset down-right, like a card physically sitting above the page). Rounded corners 16–20px. On hover: lift ~2px, shadow deepens.

**Sidebar:** keep it, but give it real visual weight — subtle border, the PARITY logotype should feel like a wordmark, not plain text. Active nav item gets a colored left indicator bar + tinted background + colored label, with the indicator sliding smoothly between items on click.

**Metric cards:** each icon sits inside a small tinted rounded-square container using its own accent color (blue for financial, orange for risk, purple for score, etc.) — not a plain grey circle. Values should **count up** from 0 on load, not appear instantly.

**Typography:** headline numbers (NOI, Deal Score, etc.) need real visual weight — bump to Display-scale bold (32-40px), tabular numerals, right-aligned in any list. Right now everything reads at the same flat weight.

**Deal Score card:** replace the static number with an animated circular gauge/arc that fills to the score value on load, verdict label beneath in its severity color (orange for CONDITIONAL).

**Risk badges / severity colors:** `CRITICAL` red · `HIGH` orange · `MEDIUM` amber · `LOW` yellow · `PASS` green · `INSUFFICIENT_DATA` grey — as bold, pill-shaped, tinted-background badges. Severity color should never appear anywhere else in the UI (keep it meaningful).

**Motion (CSS transforms/opacity only, respect `prefers-reduced-motion`):**
- Cards fade/slide in on mount, staggered by ~50-80ms each
- Metric values count up over ~800ms
- Score gauge and any bars animate their fill on load
- Primary buttons get a subtle lift + shadow-deepen on hover (not a flat color swap)
- Route transitions fade smoothly, no hard cuts

**Charts:** the NOI comparison (T-12 actual vs seller pro forma vs re-underwritten) and the risk-severity distribution should be real, styled charts — not lists of numbers. Use the severity palette for the risk chart; use distinct accent colors for the NOI bars.

## What NOT to do

Don't invent new data, new metrics, or new charts beyond what the API already returns. Don't change the JSON contract, the routes, or any data-fetching logic. Don't add stock photography or fabricated property imagery — background stays an abstract gradient (property photos are a separate, not-yet-built feature).

## Verify before finishing

Screenshot the Dashboard and confirm: dark background (not white), verdict text has a clean em dash, metric cards have tinted icon containers and hard offset shadows, and the Deal Score renders as an animated gauge, not a bare number.
