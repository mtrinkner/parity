# Lovable Prompt — PARITY visual redesign (corrected)

**How to use:** attach the reference image, then paste everything below the line.
The only changes from Mason's original: the image is demoted to *style reference only*,
the real Example Tower data is pinned as literal values, and the UI is wired to the live
n8n JSON contract. Aesthetic direction is unchanged.

---

You are an expert Lovable UI designer and frontend engineer.

I am attaching a reference image. **Use it for VISUAL STYLE ONLY — layout, spacing, hierarchy, typography, glassmorphism, shadows, gradients, depth, and motion.**

⚠️ **CRITICAL: every data value in that image is fictional placeholder content from a completely different property.** The image shows a 312-unit garden-style property in Charlotte NC scoring 82/100. My actual application analyzes a **218-unit high-rise in Metro City CO scoring 43/100**. Do NOT copy any number, address, label, metric, score, or property characteristic from the image. Copy only the *look*.

## APPLICATION CONTEXT

This is **PARITY**, an institutional multifamily deal-screening platform. An analyst uploads an Offering Memorandum (PDF); a live backend extracts the deal, re-underwrites it from trailing actuals, runs a 20-rule risk engine, and returns a scored risk position with evidence and citations.

The product thesis: **an OM is a marketing document — its headline figures are claims, not facts.** The app exists to cut through broker optimism. The UI should feel like a Bloomberg Terminal crossed with an Apple keynote: premium and cinematic, but every number defensible.

## BACKEND INTEGRATION (already live — do not modify)

```
POST https://mtrinkner.app.n8n.cloud/webhook/om-screen
  multipart/form-data
  om_file    → the PDF binary
  deal_name  → string
```
Synchronous JSON response, **20–40 seconds**. Show a staged loading sequence during the wait ("Parsing document…" → "Extracting financials…" → "Re-underwriting…" → "Running risk analysis…"), animated and premium — never a bare spinner.

Response shape (render whatever comes back; never hardcode counts):
```
{
  property: { name, address, submarket, broker, sourceOM, omDate },
  score, verdict, verdictNote, dealRiskPosture, guardrailCapped,
  counts: { critical, high, medium, low, insufficientData, pass, flaggedTotal, guardrailHits },
  topRisks: [ "SEVERITY · Rule — impact", ... ],
  metrics: [ { key, label, value, unit, provenance, omPage, note, status } ],
  flags: [ { ruleId, rule, category, severity, level, evidence, omPage,
             whyItMatters, financialImpact, recommendedNextAction,
             additionalDDRequired, guardrail } ],
  insufficientData: [ ...same shape... ],
  passes: [ ...same shape... ]
}
```
`unit` is one of `usd | pct | x | count | usd_month` — format accordingly (`pct` values are decimals: `0.0532` → `5.32%`).
`provenance` is one of `actual | seller | calculated | assumption | insufficient_data` — **display this as a small tag on every metric.** It is the most important trust signal in the product: it shows which numbers are the broker's claims versus our own re-underwriting.

## REFERENCE OUTPUT — what the live API actually returns for the test OM

Use this to build and verify your rendering/formatting. It is **not** seed data to ship: the app must render whatever the API returns for whatever OM is uploaded. Do not hardcode these values into components, and do not display them before an OM has been analyzed.

```
Property:        Example Tower
Address:         100 Example Avenue, Metro City
Submarket:       Central submarket, Metro City, CO
Broker:          Example Brokerage
Units:           218
Year built:      2015
Stories:         12  (Class AA high-rise — NOT garden style)
Avg unit size:   955 SF
Avg eff. rent:   $3,073/mo  ($3.22/SF)

Deal score:      43 / 100
Verdict:         CONDITIONAL — RE-TRADE
Verdict note:    Re-underwrite and re-trade before bidding.
Risk posture:    CRITICAL
Flag counts:     2 critical · 3 high · 9 medium · 1 low · 2 insufficient-data · 3 pass

Occupancy:       96.0% physical  /  85.0% leased   ← the 11-pt gap is a CRITICAL flag
NOI (T-12 actual):            $7,507,652   [actual]
NOI (seller pro forma):       $7,564,085   [seller]
NOI (re-underwritten Yr-1):   $7,259,957   [calculated]
Purchase price:            $136,410,200    [assumption — OM is UNPRICED]
Price per unit:                $625,735    [calculated]
Price per SF:                    $655.33   [calculated]
Going-in cap (re-underwritten):    5.32%   [calculated]
Going-in cap (seller NOI):         5.55%   [calculated]
DSCR (interest-only):              1.42x   [calculated]
DSCR (once amortizing):            1.19x   [calculated]  ← below the 1.25x floor
Debt yield:                        8.87%   [calculated]
Levered IRR (5-yr hold):          10.17%   [calculated]
Equity multiple:                   1.58x   [calculated]
```

Top risks to surface on the home screen:
1. **CRITICAL** — NOI quality / manufactured NOI — ~$73,904/yr overstated (~$1.4M of value)
2. **CRITICAL** — Occupancy & leased-rate integrity — ~$856K/yr exposure (~$16.3M of value)
3. **HIGH** — Capital-expenditure & reserve adequacy — $1.5–2.5M unfunded renovation
4. **HIGH** — Missing due-diligence coverage — screening rests on marketing figures
5. **HIGH** — Year-1 rent-growth aggressiveness — ~$289K of Yr-1 revenue not in place

## HOMEPAGE EXPERIENCE

Full-viewport cinematic hero. The property occupies the entire background with subtle blur, depth, gradient overlays, parallax on scroll, and slow ambient motion. Glass panels float above it.

**Background image:** extracted live from the uploaded OM — see the DYNAMIC PROPERTY BACKGROUND section below. Never ship a hardcoded property image.

Immediately communicate: Analysis Complete badge · Property name · Address · Deal recommendation · Deal score · Key metrics · AI Analysis Ready.

## DYNAMIC PROPERTY BACKGROUND (build exactly this)

The app must derive its background from **each uploaded OM**, never from a bundled image.

**Pre-upload state:** a clean, neutral upload screen — dark gradient, no property imagery, no example deal, no Example Tower anything. Just the drop zone, deal-name field, and product identity.

**On upload, run image extraction in parallel with the analysis request** — the two must be fully independent. The dashboard renders as soon as the API returns; the background fades in whenever it's ready. Image work must never block, delay, or fail the underwriting analysis.

### How to extract (client-side, in the browser)

Use **pdf.js (`pdfjs-dist`)** on the `File` object the user just dropped — you already have the PDF locally, before/while it uploads.

1. Load the PDF with `pdfjs.getDocument({ data: arrayBuffer })`.
2. For each of the **first ~12 pages**, call `page.getOperatorList()` and collect `OPS.paintImageXObject` / `paintJpegXObject` entries.
3. For each image name, `page.objs.get(name)` → gives `{ width, height, data }` **already decoded**.
4. Draw to an offscreen `<canvas>` via `putImageData`, then `canvas.toDataURL('image/jpeg', 0.85)`.

⚠️ **Critical:** the embedded images in these OMs are **JPEG 2000 (.jpx)**, which Chrome and Firefox **cannot decode natively**. Do **not** extract raw image bytes and assign them to an `<img src>` — it will silently fail. pdf.js has a built-in JPX decoder, so you must go through pdf.js and out via canvas. This is verified: the test OM contains 362 embedded images, the largest at 2453×1589, all JPEG 2000.

Extracting the image **XObject** (not rendering the whole page) is important — page renders bake the OM's own overlaid text and broker logos into your background, which then collides with your UI type.

### How to choose the best image

Score every extracted candidate and pick the highest:

- **Resolution** — require ≥ 1.5 MP; strongly prefer ≥ 3 MP.
- **Aspect ratio** — prefer landscape between 1.4 and 2.2 (full-bleed hero shots); reject anything near-square or portrait.
- **Page position** — earlier pages score higher; OM covers and the property section (pages 1–12) hold the hero photography.
- **Coverage** — prefer images that occupy most of their page (full-bleed) over inset thumbnails.

Reject small logos, headshots, icons, charts, and floor plans via the resolution and aspect filters.

### Progress states

Show these as a staged, animated sequence (they run concurrently with the analysis, so display honestly — don't imply the analysis is waiting on the image):

`Reading OM` → `Identifying property` → `Finding property imagery` → `Verifying image match` → `Building deal dashboard`

### Fallback

If no candidate clears the thresholds, use a **polished neutral dark gradient with depth** — never an unrelated property photo, never a stock apartment complex, never a generated building.

### Persistence, audit, and user control

Store on the deal record: the image data URL (or a Supabase Storage reference), plus **provenance metadata** — `source: "om_extraction"`, the OM page number, pixel dimensions, and the computed confidence score. Surface that provenance in the UI on hover or in Settings.

Give the user a control (in Settings or a hover action on the hero) to: **approve**, **cycle to the next-best candidate**, **upload their own image**, or **remove it** and fall back to the gradient. Persist their choice with the deal.

### Do NOT add external image search

Do not call Google Places, Street View, web image search, or any third-party image API to "find" a property photo. Reason: it cannot be verified to be the correct building. "Example Tower" alone matches properties in both Metro City CO and Charlotte NC — a confident-looking wrong building is worse than no image, and this product's entire premise is that every displayed fact is evidence-backed and traceable. The OM is a marketing document: it always contains professional photography of the actual asset. Extract from it, or show the gradient.

## LAYOUT

- **Left floating glass navigation** — Home, Executive, Underwriting, Risk Engine, Market Analysis, Reports, Documents, AI Chat, Settings. User chip pinned bottom-left.
- **Large property title** over the hero, with metadata pills beneath (units, year built, class, stories).
- **Executive recommendation card** — bottom-left glass panel: verdict, one-line rationale, circular score gauge (43/100), and a row of 4 key metric tiles with deltas.
- **Floating metric callouts** anchored over the property image — small glass cards with a connector line, e.g. Occupancy 96% / 85% leased, and Submarket Overview.
- **AI assistant panel** — bottom-right glass card with an input ("Ask me anything about this deal, the risks, or the underwriting"). Wire the input to a placeholder handler; the chatbot backend does not exist yet — show a graceful "coming soon" response rather than faking an answer.
- **Quick navigation cards** — horizontal row along the bottom: Property Overview · Underwriting · Risk Engine · Market Analysis · Reports.
- **Top-right controls** — subtle glass buttons.

## ROUTES (map to the live data)

| Route | Renders |
|---|---|
| Home | the hero experience above |
| Executive | verdict, risk posture, `topRisks`, counts, thesis |
| Underwriting | `metrics[]` grouped: Income (3 NOI figures) · Valuation (price, /unit, /SF, caps) · Debt (loan, LTV, DSCR ×2, debt yield) · Returns (IRR, equity multiple, exit value) — each with its provenance tag |
| Risk Engine | `flags[]` — severity-sorted table; row expands to a "Why Flagged" panel showing evidence, OM page citation chip, why it matters, financial impact, recommended next action, DD-required badge. Tag `guardrail: true` rows. |
| Market Analysis | market-category flags and passes (submarket fundamentals, comparables) |
| Reports | printable executive summary — property header, verdict, all flags grouped by severity, DD list. Print/export button. |
| Documents | `insufficientData[]` as a due-diligence tracker — what the OM does not disclose |
| AI Chat | placeholder panel (backend not built) |
| Settings | assumption overrides: purchase price, LTV, interest rate, amortization, IO years, exit cap, hold years — POSTed as `assumptions` JSON on the next run |

## VISUAL STYLE

Dark luxury. Large glass panels with heavy backdrop blur. Rounded corners (16–24px). Soft layered shadows. Premium subtle gradients. Minimal line icons. Generous spacing. Apple-level typographic polish. Strong hierarchy. Tabular numerals, right-aligned, for every financial figure.

**Severity color is reserved and never decorative:** CRITICAL red · HIGH orange · MEDIUM amber · LOW yellow · PASS green · INSUFFICIENT_DATA grey. Everything else stays neutral. This is a risk tool — color must mean something.

## MOTION

Tasteful only: fade-ins on mount, staggered card entrances, parallax on the hero, hover elevation on glass panels, smooth route transitions, slow ambient background drift. Never distract from readability. Respect `prefers-reduced-motion`.

## RULES

- Do NOT copy any data from the reference image.
- Do NOT modify backend logic, workflows, or the webhook contract.
- Do NOT invent property details, photos, metrics, or risk categories.
- If a value is missing from the API response, render an explicit **"Insufficient Data"** state naming what's required — never a dash, zero, or a fabricated number.
- Keep all seed/demo data in **one file** so it can be stripped when the live call is wired.
- Store the webhook URL in an environment variable, not inline.
