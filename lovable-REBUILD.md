# PARITY — full rebuild prompt for Lovable

Paste everything below the line into a **new Lovable project**. No image attachment needed — the design is fully specified in text.

---

Build **PARITY**, an institutional multifamily deal-screening web app. React + Tailwind. Clean, restrained, institutional-fintech aesthetic — think Stripe / Linear / Mercury. Not flashy, no glassmorphism, no heavy gradients or glow.

## WHAT THE PRODUCT DOES

An acquisitions analyst uploads a multifamily Offering Memorandum (PDF). A live backend extracts the deal, re-underwrites it from trailing actuals, runs a 20-rule risk engine, and returns a scored risk position with evidence and OM page citations.

The thesis: **an OM is a marketing document — its headline figures are claims, not facts.** This app separates broker claims from independent re-underwriting. Every number on screen must be traceable to a source.

## DESIGN TOKENS (use exactly — do not approximate)

```
Primary / brand      #2563EB     (buttons, links, active nav, focus rings)
Primary light/hover  #4C82F0
Primary dark         #1D4ED8

Page background      #F8FAFC     (cool slate — NOT pure white)
Card / panel         #FFFFFF
Border               #E2E8F0
Muted text           #64748B
Primary text         #0F172A     (near-black slate — NOT pure black)
```

**Severity colors — each means exactly ONE thing, never used decoratively:**
```
CRITICAL            #EF4444   red
HIGH                #F97316   orange
MEDIUM              #F59E0B   amber
LOW                 #EAB308   yellow
PASS                #22C55E   green
INSUFFICIENT_DATA   #64748B   grey
```
If something on screen is colored, it must carry meaning. Everything else stays neutral.

**Typography:** Inter (or system sans). Strong hierarchy: big bold numbers, smaller muted labels. Financial figures use **tabular numerals, right-aligned**. No decorative fonts.

---

## ROUTE 1 — `/` UPLOAD LANDING PAGE

This is the entry point. It renders **alone** — no sidebar, no navbar, no footer, no dashboard behind it.

Full-viewport, vertically centered composition on a cool slate-white background (`#F8FAFC`) with a very subtle blue-grey fade toward the bottom. Optionally add extremely faint architectural linework at the far left and right edges, drawn with CSS only (low-opacity thin lines) — keep it barely perceptible. No images, no stock photos.

Stacked and centered:

1. **PARITY** — large uppercase wordmark, `#0F172A`, bold, generous letter-spacing (~0.15em). This is the dominant element.
2. Directly beneath: `AI-POWERED MULTIFAMILY RISK REVIEW` — uppercase, letter-spaced, small, muted `#64748B`.
3. **Upload panel** — white card, max-width ~820px, 1px `#E2E8F0` border, very soft shadow, ~20px radius, generous padding. Inside it a **dashed** inner drop zone (dashed `#CBD5E1` border, ~12px radius, lots of internal whitespace) containing:
   - an upload-cloud / document icon inside a soft rounded tinted square (light blue tint, `#2563EB` icon)
   - headline: **Drop your Offering Memorandum here** (bold, `#0F172A`, ~1.5rem)
   - supporting copy: `Drag and drop your OM file to get started` (muted)
   - primary button: **Upload OM** — solid `#2563EB`, white text, upload icon, comfortable padding, subtle hover lift
4. Beneath the panel: small shield icon + `Your data is secure and confidential`, muted, centered.

**Upload behavior:**
- Accept **PDF only**, single file. Reject anything else with a clear inline error.
- Three ways to upload: click the button (real `<input type="file" accept="application/pdf">`), drag & drop onto the zone, and keyboard activation. Drag-drop must never be the only method.
- Drag-over state: slightly stronger blue border + very subtle blue tint. No dramatic glow.
- The deal name is **derived from the filename** (strip `.pdf`). Do not add a visible deal-name field.

**While processing** (this takes 30–40 seconds — do NOT use a short timeout, use 90s):
Replace the drop-zone content with a restrained loading state:
- heading: `Analyzing Offering Memorandum`
- supporting text cycling every ~4s through exactly these, holding on the last:
  `Uploading document…` → `Extracting property data…` → `Evaluating underwriting risks…` → `Preparing deal review…`
- an indeterminate progress bar
- disable the drop zone and button

⚠️ **Never show fake percentages, fake ETAs, document counts, or confidence scores.** The backend does not return them. Inventing them would be fabricating data.

**On success:** navigate to `/dashboard` and render the real returned analysis.
**On any error:** show the real error message, re-enable the zone, and **stay on `/`** — never navigate on failure.

Accessibility: semantic button + labeled file input, visible focus rings, announce validation/processing/error via `aria-live="polite"`, respect `prefers-reduced-motion`.

---

## BACKEND (already live — do not modify or mock)

```
POST https://mtrinkner.app.n8n.cloud/webhook/om-screen
Content-Type: multipart/form-data
  om_file    → the PDF binary
  deal_name  → string
```
No auth required. Store the URL in one constant.

**Response takes 30–40 seconds.** Use a 90-second timeout.

### Success response shape

```json
{
  "property": {
    "name": "Example Tower",
    "address": "100 Example Avenue, Metro City",
    "submarket": "Central submarket, Metro City, CO",
    "broker": "Example Brokerage (Will Haass, Tony Nargi, …)",
    "sourceOM": "Example Tower Offering Memorandum (Example Brokerage)",
    "omDate": "2025"
  },
  "score": 43,
  "verdict": "CONDITIONAL — RE-TRADE",
  "verdictNote": "Re-underwrite and re-trade before bidding.",
  "dealRiskPosture": "CRITICAL",
  "guardrailCapped": false,
  "ruleSetVersion": "1.0",
  "counts": { "critical":2,"high":3,"medium":8,"low":1,"insufficientData":2,"pass":4,"flaggedTotal":14,"guardrailHits":3 },
  "topRisks": ["CRITICAL · NOI quality / manufactured NOI — …", "…"],
  "metrics": [
    { "key":"units","label":"Units","value":218,"unit":"count","provenance":"actual","omPage":"p9","note":null,"status":"OK" },
    { "key":"noiUnderwritten","label":"NOI — re-underwritten Year-1","value":7259957,"unit":"usd","provenance":"calculated","omPage":null,"note":"…","status":"OK" }
  ],
  "flags": [
    { "ruleId":"R05","rule":"NOI quality / manufactured NOI","category":"NOI Quality","status":"FLAG",
      "severity":"CRITICAL","level":2,"weight":12,"pointsLost":12,
      "evidence":"Seller Year-1 NOI ($7,564,085) exceeds T-12 actual ($7,507,652) via expense cuts, not revenue…",
      "omPage":"p42",
      "whyItMatters":"NOI lifted by cutting expenses below trailing actuals — rather than growing revenue — is not durable…",
      "financialImpact":"~$73,904/yr of NOI overstated → ≈$1,407,695 of value at 5.3%.",
      "recommendedNextAction":"Re-underwrite controllable expenses to T-12 actuals…",
      "additionalDDRequired":true,"guardrail":false }
  ],
  "insufficientData": [ /* same shape, severity "INSUFFICIENT_DATA" */ ],
  "passes": [ /* same shape, severity "PASS" */ ]
}
```

**The 21 metric keys returned:** `units, occupancyPhysical, occupancyLeased, avgEffRent, noiT12, noiSeller, noiUnderwritten, purchasePrice, pricePerUnit, pricePerSf, capRateUnderwritten, capRateSeller, loanAmount, ltv, dscrIO, dscrAmortizing, debtYield, equityInvested, exitValue, leveredIrr, equityMultiple`

**Array lengths vary per deal — always render whatever comes back. Never hardcode counts.**

### Formatting rules
- `unit` is one of `usd | pct | x | count | usd_month`
- `pct` values are **decimals** — `0.0532` renders as `5.32%`
- `usd` → `$7,259,957` (no cents) · `x` → `1.58x` · `usd_month` → `$3,073/mo` · `count` → `218`
- A `null`/missing value renders an explicit **"Insufficient Data"** chip — never a dash, zero, or invented number.

### `provenance` is the most important trust signal in the product
Every metric carries one of: `actual` (OM trailing actual) · `seller` (OM pro forma claim) · `calculated` (our re-underwriting) · `assumption` (default input). Render it on **every** metric as a small muted uppercase micro-label. This is what proves the app distinguishes broker claims from independent analysis. Do not omit it.

### Error response shape
```json
{ "error": { "stage":"document_validation", "code":"NO_TEXT_LAYER",
             "message":"This PDF has no extractable text layer…", "retryable":false,
             "detail":{ "charsExtracted":0,"pages":54,"charsPerPage":0 } } }
```
Codes: `NO_TEXT_LAYER` (scanned PDF), `NOT_A_MULTIFAMILY_OM` (wrong document type), `extraction_parse`. Render the `message` cleanly with a retry action and the `detail` object in a collapsible "diagnostics" section.

## STATE

Hold one analysis result in app-level state (Context or a store) shared across all routes, so the landing page's result flows into the dashboard. Do NOT persist to localStorage — refreshing `/` should return to a clean upload page.

---

## ROUTE 2 — `/dashboard`

Persistent left sidebar (white, right border) with the PARITY wordmark and nav. Active item gets a `#2563EB` tinted background + colored label. Nav items: Dashboard · Executive Summary · Underwriting · Risk Engine · Reports.

Main area:
- **Property header** — property name (large, bold), address, submarket · broker, and a units chip.
- **Three-column row:**
  - **Deal Score** card — the score as a large circular gauge/arc filling to `score`, the number dominant in the center. Beneath: `verdict` in a severity-colored pill, then `verdictNote`, then `Risk Posture: {dealRiskPosture}`.
  - **Risk Engine** card — the 5 highest-severity flags: rule name, severity badge, `−{pointsLost} pts · {category}`. Link → Risk Engine.
  - **Underwriting Highlights** card — label/value rows with provenance tags: Purchase Price, NOI (re-underwritten), Going-in Cap, Levered IRR, Equity Multiple, Price per Unit. Link → Underwriting.
- **Executive Summary** card (full width) — two columns: **Strengths** (green checks, from `passes`) and **Concerns** (red icons, from top `flags`, showing the `financialImpact`).

---

## ROUTE 3 — `/risk-engine`

- **Severity distribution** — donut chart from `counts`, using the severity palette, with the total flagged count in the center and a legend.
- **Score impact** — horizontal bars of the top flags ranked by `pointsLost`, bar colored by severity.
- **All flags** — every entry from `flags`, sorted by severity then points lost. Each row: severity badge, rule name, `{ruleId} · {category} · OM {omPage}`, `−{pointsLost} pts`. **Expanding a row** reveals: `evidence`, `whyItMatters`, `financialImpact` (emphasized), `recommendedNextAction`, and a DD-required badge. Tag `guardrail: true` rows.
- Also render `insufficientData` and `passes` in the same list style, clearly labeled. Show the counts honestly (e.g. "14 flagged · 4 passed · 2 insufficient data").

---

## ROUTE 4 — `/underwriting`

- **NOI comparison** — a prominent 3-bar chart: `noiT12` (T-12 actual) vs `noiSeller` (seller pro forma) vs `noiUnderwritten` (PARITY re-underwritten), each bar a distinct color, values labeled. **This gap is the core story of the product — make it the most prominent element on the page.**
- **Full metrics table** — every metric from `metrics[]`, grouped into **Income · Valuation · Debt · Returns**. Each row: label, value (right-aligned, tabular), and its **provenance tag**. Include the `note` on hover or as muted subtext where present.

---

## ROUTE 5 — `/executive-summary`

Verdict, risk posture, `topRisks` list, severity counts, rule-set version, and the strengths/concerns breakdown in a print-friendly layout.

## ROUTE 6 — `/reports`

A printable summary: property header, verdict, all flags grouped by severity, and the insufficient-data list as a due-diligence tracker. Include a Print button using the browser print dialog, and an "Export JSON" button that downloads the raw response exactly as returned (nothing recomputed).

---

## HARD RULES

- **Never fabricate data.** No invented metrics, charts, comps, activity feeds, property photos, confidence scores, processing times, or document counts. If the API doesn't return it, it doesn't go on screen.
- Do not build a market/comps view, a map, a heatmap, or any time-series chart — the API returns no geocoded, comparable, or time-series data for them.
- If a value is missing, render an explicit **"Insufficient Data"** state naming what's required.
- Severity color is reserved and never decorative.
- Keep any development placeholder data in **one file** so it can be deleted cleanly.
- Motion: tasteful only — fade-ins on mount, staggered card entrance, hover elevation, count-up on the headline numbers, gauge/bar fill on load. Respect `prefers-reduced-motion`.
- Responsive: sidebar collapses under 1280px, cards reflow to a single column on mobile, the landing page drops the architectural linework and scales type down.
