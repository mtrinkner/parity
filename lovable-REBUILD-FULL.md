# PARITY — full rebuild with cinematic hero (Lovable prompt)

**Before pasting:** attach these 5 files to your message, in this order:
1. The hero image (PARITY building at dusk, wordmark on building, headline copy)
2. The hero video (`hf_20260801_183751_...mp4` from your Desktop — 9s, ends on the upload screen)
3. The upload-screen reference image
4. The dashboard reference image (Example Tower, Deal Score 43)
5. (Optional, only if you have a second dashboard angle) any additional dashboard reference

Then paste everything below the line into a **new Lovable project**.

---

Build **PARITY**, an institutional multifamily deal-screening web app. React + Tailwind. Clean, restrained, institutional-fintech aesthetic — Stripe / Linear / Mercury, not flashy.

I've attached 4 reference assets. **Match them as design specifications — do not reinterpret or redesign them.** Image 1 and the video define the hero/intro. Image 3 defines the upload screen. Image 4 defines the dashboard layout. Copy their exact visual style (colors, spacing, typography, card structure).

⚠️ **Every number in the dashboard reference image is real data from a live analysis run — copy the layout, not blindly trust every digit if it ever conflicts with the JSON contract below (the contract is authoritative for what fields exist and their exact values on any given real deal).**

## WHAT THE PRODUCT DOES

An acquisitions analyst uploads a multifamily Offering Memorandum (PDF). A live backend extracts the deal, re-underwrites it from trailing actuals, and runs a 20-rule risk engine, returning a scored risk position with evidence and OM page citations.

The thesis: **an OM is a marketing document — its headline figures are claims, not facts.** PARITY separates broker claims from independent re-underwriting. Every number on screen must be traceable to a source — the `provenance` tag on every metric is the product's core trust signal.

## DESIGN TOKENS (exact)

```
Primary / brand      #2563EB
Primary light/hover  #4C82F0
Primary dark         #1D4ED8

Page background      #F8FAFC
Card / panel         #FFFFFF
Border               #E2E8F0
Muted text           #64748B
Primary text         #0F172A
```

**Severity — each color means exactly one thing, never decorative:**
```
CRITICAL   #EF4444   HIGH   #F97316   MEDIUM   #F59E0B
LOW        #EAB308   PASS   #22C55E   INSUFFICIENT_DATA  #64748B
```

Typography: Inter. Bold big numbers, small muted uppercase labels. Financial figures tabular, right-aligned.

---

## SECTION 1 — CINEMATIC HERO (scroll-scrubbed, Apple-product-page style)

Full-viewport sticky video section, ~400–500vh scroll height.

- The **hero image** (attached image 1) is the poster frame / first frame, shown before video loads and as the `poster` attribute.
- The **hero video** (attached) fills the viewport, `object-fit: cover`, muted, `playsInline`, `preload="auto"`. **Never autoplay** — its `currentTime` is driven entirely by scroll position via `requestAnimationFrame` with smooth interpolation (lerp), clamped to `[0, duration]`. Wait for `loadedmetadata` before scrubbing. Use refs, not React state, for per-frame values. Scrolling down plays forward; scrolling up plays backward.
- Overlay copy fades in/out at scroll milestones, matching the hero image's typography exactly: the PARITY wordmark top-left, then the large headline **"From offering memorandum. To investment clarity."** (with "clarity." in the primary blue), then supporting copy about uploading one document, then the secure-data caption with shield icon. Fade these in/out as the user scrolls — don't show them all at once statically.
- A small "SCROLL TO BEGIN" indicator with a mouse-scroll icon, as in the reference image, fading out once scrolling starts.
- The video's final frame is a monitor showing the upload screen. When scroll reaches the end, **crossfade directly into the live upload interface** (Section 2) — never a screenshot, the real interactive component.
- Respect `prefers-reduced-motion`: skip the scroll-scrub entirely, show the static hero image with the headline copy and a simple "Enter" button that fades into the upload screen.
- Gate this hero to first visit only (sessionStorage) — returning to `/` in the same session skips straight to the upload screen so it isn't repetitive during testing/demoing.

## SECTION 2 — UPLOAD SCREEN

Match the attached upload-screen reference image exactly:

- Full-viewport, centered, light cool-slate background (`#F8FAFC`) with a subtle blue-grey fade toward the bottom and very faint architectural linework at the far left/right edges (CSS only, no images).
- Large uppercase **PARITY** wordmark, `#0F172A`, bold, letter-spaced, centered.
- Subtitle beneath: `AI-POWERED MULTIFAMILY RISK REVIEW`, small, muted, letter-spaced uppercase.
- White upload panel, ~820px max width, subtle border, soft shadow, ~20px radius. Inside it, a **dashed** inner drop zone containing:
  - upload-cloud icon in a soft tinted square
  - headline: **Drop your Offering Memorandum here**
  - supporting copy: `Drag and drop your OM file to get started`
  - primary button: **Upload OM**, solid `#2563EB`, white text, upload icon
- Beneath the panel: shield icon + `Your data is secure and confidential`, muted, centered.

**Upload behavior:**
- PDF only, single file. Click button, drag & drop, and keyboard activation all work.
- Deal name is derived from the filename (strip `.pdf`) — no visible name field.
- Drag-over: slightly stronger blue border + subtle blue tint, no glow.
- Reject non-PDFs with a clear inline error, `aria-live="polite"`.

**While processing** (30–40 seconds — use a 90s timeout, never a short one):
- Replace drop-zone content with: heading `Analyzing Offering Memorandum`, supporting text cycling every ~4s through exactly `Uploading document…` → `Extracting property data…` → `Evaluating underwriting risks…` → `Preparing deal review…` (hold on the last), an indeterminate progress bar. Disable the zone/button.
- **Never show percentages, ETAs, document counts, or confidence scores** — the backend returns none of these.

**On success:** transition into the dashboard (Section 3) with a 500–700ms crossfade (opacity + slight scale), rendering the real returned data.
**On error:** show the real error message, re-enable the zone, stay on the upload screen — never navigate on failure.

## BACKEND (already live — do not modify or mock)

```
POST https://mtrinkner.app.n8n.cloud/webhook/om-screen
Content-Type: multipart/form-data
  om_file    → the PDF binary
  deal_name  → string
```
No auth. 90-second timeout.

### Response shape (real example — arrays vary per deal, never hardcode counts)

```json
{
  "property": { "name":"Example Tower","address":"100 Example Avenue, Metro City","submarket":"Central submarket, Metro City, CO","broker":"Example Brokerage (Will Haass, Tony Nargi, …)","sourceOM":"Example Tower Offering Memorandum (Example Brokerage)","omDate":"2025" },
  "score": 43,
  "verdict": "CONDITIONAL — RE-TRADE",
  "verdictNote": "Re-underwrite and re-trade before bidding.",
  "dealRiskPosture": "CRITICAL",
  "guardrailCapped": false,
  "ruleSetVersion": "1.0",
  "counts": { "critical":2,"high":3,"medium":8,"low":1,"insufficientData":2,"pass":4,"flaggedTotal":14,"guardrailHits":3 },
  "topRisks": ["CRITICAL · NOI quality / manufactured NOI — …"],
  "metrics": [
    { "key":"units","label":"Units","value":218,"unit":"count","provenance":"actual","omPage":"p9","note":null,"status":"OK" },
    { "key":"noiUnderwritten","label":"NOI — re-underwritten Year-1","value":7259957,"unit":"usd","provenance":"calculated","omPage":null,"note":"…","status":"OK" }
  ],
  "flags": [
    { "ruleId":"R05","rule":"NOI quality / manufactured NOI","category":"NOI Quality","status":"FLAG",
      "severity":"CRITICAL","level":2,"weight":12,"pointsLost":12,
      "evidence":"Seller Year-1 NOI ($7,564,085) exceeds T-12 actual ($7,507,652) via expense cuts…",
      "omPage":"p42","whyItMatters":"NOI lifted by cutting expenses below trailing actuals is not durable…",
      "financialImpact":"~$73,904/yr of NOI overstated → ≈$1,407,695 of value at 5.3%.",
      "recommendedNextAction":"Re-underwrite controllable expenses to T-12 actuals…",
      "additionalDDRequired":true,"guardrail":false }
  ],
  "insufficientData": [ /* same shape, severity "INSUFFICIENT_DATA" */ ],
  "passes": [ /* same shape, severity "PASS" */ ]
}
```

**21 metric keys:** `units, occupancyPhysical, occupancyLeased, avgEffRent, noiT12, noiSeller, noiUnderwritten, purchasePrice, pricePerUnit, pricePerSf, capRateUnderwritten, capRateSeller, loanAmount, ltv, dscrIO, dscrAmortizing, debtYield, equityInvested, exitValue, leveredIrr, equityMultiple`

**Formatting:** `pct` values are decimals (`0.0532` → `5.32%`); `usd` → `$7,259,957`; `x` → `1.58x`; `count` → `218`. A `null` value renders an explicit **"Insufficient Data"** chip — never a dash or zero.

**`provenance`** (`actual | seller | calculated | assumption`) renders on **every metric** as a small muted uppercase tag. Never omit it.

### Error shape
```json
{ "error": { "stage":"document_validation", "code":"NO_TEXT_LAYER", "message":"…", "retryable":false, "detail":{...} } }
```
Codes: `NO_TEXT_LAYER`, `NOT_A_MULTIFAMILY_OM`, `extraction_parse`. Render `message` cleanly with a retry action.

## STATE

One deal result in app-level Context, shared between the upload screen and dashboard. Do NOT persist to localStorage — refreshing should return to the hero/upload flow.

---

## SECTION 3 — DASHBOARD (match attached dashboard reference image)

Persistent left sidebar (white, thin right border): PARITY wordmark, nav (Dashboard active, Executive Summary, Underwriting, Risk Engine, Reports), a "Current Deal" block (name, address, units, green "Analysis Complete" chip), and an outlined "Upload New OM" button at the bottom.

Main area:
1. **Property header** — green `ANALYSIS COMPLETE` pill, large property name, muted metadata line (address · submarket · broker), units chip.
2. **Three-column row:**
   - **Deal Score** — circular gauge filled to `score`/100, severity-colored arc, huge number centered, `verdict` pill beneath, then `verdictNote`, then `Risk Posture: {dealRiskPosture}`.
   - **Risk Engine** — top 5 flags by severity: rule name, severity badge, `−{pointsLost} pts · {category}`. Link to Risk Engine.
   - **Underwriting Highlights** — label/value rows with provenance tags: Purchase Price, NOI (re-underwritten), Going-in Cap, Levered IRR, Equity Multiple, Price/Unit. Link to Underwriting.
3. **NOI: Broker Claim vs Reality** — wide card, prominent 3-bar chart: T-12 Actual / Seller Pro Forma / Re-underwritten, each labeled with value and provenance tag. This is the core narrative — give it visual weight, as in the reference image.
4. **Bottom row:** Executive Summary (Strengths from `passes`, Concerns from top `flags` with `financialImpact`) + Documents card (the single uploaded PDF, filename, size, "Parsed" chip, note that only one PDF is ingested).

### `/risk-engine`
Severity donut from `counts`. Score-impact horizontal bars ranked by `pointsLost`, colored by severity. Full flags list (+ `insufficientData` + `passes`), expandable rows showing `evidence`, `whyItMatters`, `financialImpact`, `recommendedNextAction`, DD-required badge.

### `/underwriting`
The NOI 3-bar comparison again, prominent. Full metrics table grouped Income / Valuation / Debt / Returns, every row with its provenance tag.

### `/executive-summary`
Verdict, posture, `topRisks`, severity counts, strengths/concerns, print-friendly.

### `/reports`
Printable summary + "Export JSON" (raw response, nothing recomputed) + Print button.

---

## HARD RULES

- **Never fabricate data.** No invented metrics, sparklines, market comps, comp photos, maps, heatmaps, activity feeds, property photos, confidence scores, processing times, or document counts. If the API doesn't return it, it doesn't appear.
- Severity color is reserved and never decorative.
- Missing value → explicit "Insufficient Data" state, never a dash/zero.
- Keep dev placeholder/sample data in one file, clearly marked as sample, easy to delete.
- Motion: tasteful only — fade-ins, staggered card entrance, hover elevation, count-up on headline numbers, gauge/bar fill on load. Respect `prefers-reduced-motion` everywhere, not just the hero.
- Responsive: sidebar collapses under 1280px, cards reflow to one column on mobile, hero drops the linework and scales type down on small screens.
