# PROMPT 1 — Core application

**Before pasting:** in n8n, open the **Webhook** node → Options → Add option → **Allowed Origins (CORS)** → set to `*` → Save → Publish. Without this the browser blocks the response and it will look like a front-end bug.

**In Lovable:** attach the reference screenshot, then paste everything below the line.

---

Build **PARITY**, an institutional multifamily deal-screening platform. React + Tailwind, dark luxury aesthetic.

I've attached a reference screenshot. **Use it for VISUAL STYLE ONLY** — layout, spacing, hierarchy, typography, glassmorphism, shadows, gradients, depth, motion.

⚠️ **Every data value in that screenshot is fictional placeholder content from a different property.** It shows a 312-unit garden-style complex in Charlotte NC scoring 82/100. This app analyzes whatever OM the user uploads — for the test OM that's a 218-unit high-rise in Metro City scoring 43/100. **Do not copy any number, address, score, metric, or property characteristic from the image.** Copy only the look.

## WHAT THE PRODUCT DOES

An acquisitions analyst uploads a multifamily Offering Memorandum (PDF). A live backend extracts the deal, re-underwrites it from trailing actuals, runs a 20-rule risk engine, and returns a scored risk position with evidence and page citations.

The thesis: **an OM is a marketing document — its headline figures are claims, not facts.** This app cuts through broker optimism. Every number on screen must be traceable. The feel is Bloomberg Terminal crossed with an Apple keynote.

## BACKEND (already live — do not modify or mock)

```
POST https://mtrinkner.app.n8n.cloud/webhook/om-screen
Content-Type: multipart/form-data
  om_file    → the PDF binary
  deal_name  → string
```

Store the URL in an environment variable, not inline. No auth required.

**Response takes 20–40 seconds.** This is normal — the model reads a 54-page document. Do not add a short timeout. Show a staged, premium loading sequence during the wait:

`Reading OM` → `Extracting financials` → `Re-underwriting` → `Running risk analysis` → `Building dashboard`

Animate the stages on a timer while the request is in flight. Never a bare spinner.

### Success response shape

```json
{
  "property": { "name","address","submarket","broker","sourceOM","omDate" },
  "score": 43,
  "verdict": "CONDITIONAL — RE-TRADE",
  "verdictNote": "Re-underwrite and re-trade before bidding.",
  "dealRiskPosture": "CRITICAL",
  "guardrailCapped": false,
  "ruleSetVersion": "1.0",
  "counts": { "critical":2,"high":3,"medium":9,"low":1,"insufficientData":2,"pass":3,"flaggedTotal":15,"guardrailHits":3 },
  "topRisks": ["CRITICAL · NOI quality / manufactured NOI — ~$73,904/yr of NOI overstated → ≈$1,407,695 of value at 5.3%.", "..."],
  "metrics": [
    { "key":"noiUnderwritten","label":"NOI — re-underwritten Year-1","value":7259957,"unit":"usd",
      "provenance":"calculated","omPage":null,"note":"Seller pro forma with turnover/R&M restored to T-12…","status":"OK" },
    { "key":"capRateUnderwritten","label":"Going-in cap — re-underwritten NOI","value":0.0532,"unit":"pct",
      "provenance":"calculated","omPage":null,"note":null,"status":"OK" },
    { "key":"occupancyPhysical","label":"Physical occupancy","value":0.96,"unit":"pct",
      "provenance":"actual","omPage":"p9","note":null,"status":"OK" }
  ],
  "flags": [
    { "ruleId":"R05","rule":"NOI quality / manufactured NOI","category":"NOI Quality","status":"FLAG",
      "severity":"CRITICAL","level":2,"weight":12,"pointsLost":12,
      "evidence":"Seller Year-1 NOI ($7,564,085) exceeds T-12 actual ($7,507,652) via expense cuts, not revenue: Turnover -32.1% and R&M -25.7% below T-12 (p42, 'Example Brokerage market adjustment').",
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

Arrays vary in length per deal — render whatever comes back, never hardcode counts. For the test OM: 21 metrics, 15 flags, 2 insufficientData, 3 passes.

**Formatting rules:**
- `unit` is `usd | pct | x | count | usd_month`
- `pct` values are **decimals** — `0.0532` renders as `5.32%`
- `usd` → `$7,259,957` · `x` → `1.42x` · `usd_month` → `$3,073/mo`
- Financial figures use **tabular numerals, right-aligned**

**`provenance` is the most important trust signal in the product.** Show it as a small tag on every metric: `actual` (OM trailing actual) · `seller` (OM pro forma claim) · `calculated` (our re-underwriting) · `assumption` (user input). It's what proves the app distinguishes broker claims from independent analysis. Style it subtly — a muted uppercase micro-label, not a loud badge.

### Error response shape

```json
{ "error": { "stage":"document_validation", "code":"NO_TEXT_LAYER",
             "message":"This PDF has no extractable text layer…", "retryable":false,
             "detail":{ "charsExtracted":0,"pages":54,"charsPerPage":0 } } }
```

Codes: `NO_TEXT_LAYER` (scanned PDF), `NOT_A_MULTIFAMILY_OM` (wrong document type), `extraction_parse`. Render a clean error state showing the `message`, with the `detail` object available in a collapsible "diagnostics" section, plus a retry action.

## STATE

Hold one analysis result in app-level state (Context or a store) so every route reads the same deal. Persist to `localStorage` so a refresh doesn't wipe the screening. Before any upload, all routes except Upload show an empty state pointing the user to upload an OM.

## ROUTES — persistent left glass sidebar

Build in this priority order. **Home, Risk Engine, and Underwriting are the substance** — make those excellent; the rest can be simpler.

| Route | Content |
|---|---|
| **Home** | Full-viewport hero. Analysis Complete badge · property name (large) · address · metadata pills (units, year built, stories, class) · floating glass **Executive Recommendation** card bottom-left with verdict, `verdictNote`, circular score gauge (43/100), and 4 key metric tiles · floating metric callouts anchored over the background (Occupancy, Submarket) · **AI Analyst** panel bottom-right · horizontal quick-nav cards along the bottom |
| **Risk Engine** | All `flags` sorted by severity. Each row: severity chip, rule name, category, financial impact. Expanding a row opens a **Why Flagged** panel: `evidence`, an OM page citation chip, `whyItMatters`, `financialImpact` (emphasized), `recommendedNextAction`, and a DD-required badge. Tag `guardrail: true` rows. Filter by severity and category. |
| **Underwriting** | `metrics` grouped into Income (the three NOI figures side by side — the seller-vs-re-underwritten gap is the story), Valuation (price, /unit, /SF, both cap rates), Debt (loan, LTV, both DSCRs, debt yield), Returns (IRR, equity multiple, exit value). Provenance tag on every row. |
| **Executive** | Verdict, risk posture, `topRisks` list, severity counts, rule-set version |
| **Market Analysis** | Flags and passes in the Market / Comparables categories |
| **Documents** | `insufficientData` rendered as a due-diligence tracker — what the OM fails to disclose and what to request |
| **Reports** | Printable executive summary: property header, verdict, all flags grouped by severity, DD list. Print button using the browser print dialog. |
| **AI Chat** | Panel with an input, but the chat backend does not exist yet. Return an honest "Conversational analysis is coming soon — the screening data is live in the other tabs." Do **not** fabricate answers. |
| **Settings** | Assumption overrides — purchase price, LTV, interest rate, amortization years, IO years, exit cap, hold years. Sent as an `assumptions` JSON field on the next upload. |

## VISUAL STYLE

Dark luxury. Large glass panels with heavy backdrop blur. Rounded corners 16–24px. Soft layered shadows. Premium subtle gradients. Minimal line icons. Generous spacing. Apple-level typographic polish and hierarchy.

**Background:** a rich, deep, abstract dark gradient with depth and subtle ambient movement. **Do not use any property photograph, stock apartment image, or generated building.** (Real property imagery is added in a later step.)

**Severity color is reserved and never decorative:**
`CRITICAL` red · `HIGH` orange · `MEDIUM` amber · `LOW` yellow · `PASS` green · `INSUFFICIENT_DATA` grey.
Everything else stays neutral. This is a risk tool — if something is colored, it must mean something.

## MOTION

Fade-ins on mount, staggered card entrances, hover elevation on glass panels, smooth route transitions, slow ambient background drift. Tasteful only, never distracting. Respect `prefers-reduced-motion`.

## RULES

- Do not copy any data from the reference image.
- Do not invent property details, metrics, risk categories, or photos.
- If a value is missing from the response, render an explicit **"Insufficient Data"** state naming what's required — never a dash, a zero, or a fabricated number.
- Keep any placeholder data used during development in **one file** so it can be deleted cleanly.
