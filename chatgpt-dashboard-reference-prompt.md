# ChatGPT prompt — generate the PARITY dashboard reference image

Paste everything below the line into ChatGPT and ask it to generate the image.

---

Act as a senior product designer specializing in institutional fintech and commercial real estate software. Generate a **high-fidelity desktop dashboard UI mockup** (16:9, desktop web app, ~1920×1080) for a product called **PARITY**.

## What PARITY is

An AI-powered multifamily Offering Memorandum (OM) risk-review tool built for a CBRE × Project Destined hackathon. An acquisitions analyst uploads an OM PDF; the system extracts the deal, re-underwrites it from trailing actuals, runs a 20-rule risk engine, and returns a scored verdict with evidence and OM page citations.

**The product thesis, which the design must communicate visually:** an OM is a marketing document — its headline figures are *claims*, not facts. PARITY separates broker claims from independent re-underwriting. Every number on screen is traceable to a source. The single most important visual element is the **provenance tag** on each metric, which labels where that number came from.

The audience is an institutional acquisitions VP. The design must feel credible, calm, and analytical — not consumer, not flashy, not a startup landing page.

## Visual style

Clean institutional fintech — the restraint of Stripe, Linear, or Mercury. Flat white cards on a cool slate background, thin borders, very soft shadows, generous whitespace, strong typographic hierarchy. **No** glassmorphism, no glow, no neon, no heavy gradients, no 3D, no dark mode, no decorative illustration, no background photography.

Typography: Inter or similar clean sans. Large bold numbers, small muted uppercase labels. Financial figures right-aligned with tabular numerals.

## Exact color palette (use these precisely)

```
Primary / brand      #2563EB   blue — buttons, active nav, links, accents
Page background      #F8FAFC   cool slate white
Card / panel         #FFFFFF   white
Border               #E2E8F0   light grey-blue
Muted text           #64748B   slate
Primary text         #0F172A   near-black navy
```

**Severity colors — each means exactly one thing and is never used decoratively:**
```
CRITICAL             #EF4444   red
HIGH                 #F97316   orange
MEDIUM               #F59E0B   amber
LOW                  #EAB308   yellow
PASS                 #22C55E   green
INSUFFICIENT DATA    #64748B   grey
```
Nothing else on the screen is colored. If an element has color, it carries meaning.

## Layout

**Left sidebar** (fixed, white, thin right border, ~260px):
- PARITY wordmark at top with a small blue bar-chart mark; beneath it, small muted text "OM Risk Review"
- Nav items with simple line icons: Dashboard (active — blue tinted background, blue label), Executive Summary, Underwriting, Risk Engine, Reports
- Near the bottom, a compact "Current Deal" block: Example Tower / 100 Example Avenue, Metro City, CO / 218 Units, and a green "Analysis Complete" chip
- An outlined full-width "Upload New OM" button at the very bottom

**Main content area** on `#F8FAFC`:

**1. Property header (top):**
- Green pill: `ANALYSIS COMPLETE`
- Large bold property name: **Example Tower**
- Below it, muted metadata on one line with a location pin: `100 Example Avenue, Metro City` · `Central submarket, Metro City, CO` · `Example Brokerage`
- A small chip: `218 Units`

**2. Three-column row of cards, equal height:**

**Card A — DEAL SCORE.** A large circular arc gauge, roughly 43% filled, the filled portion in orange `#F97316` fading toward red, the remainder light grey. In the center, a very large bold **43** — this is the dominant number on the entire page. Beneath the gauge: an orange pill reading `CONDITIONAL — RE-TRADE` (use a real em dash), then muted text `Re-underwrite and re-trade before bidding.`, then smaller muted text `Risk Posture: CRITICAL`.

**Card B — RISK ENGINE.** Header "Risk Engine" with small muted subtext `20 rules · 14 flags raised`. Then five rows, each with the rule name, a severity badge on the right, and muted subtext showing points lost and category:
- `NOI quality / manufactured NOI` — **CRITICAL** badge — `−12 pts · NOI Quality`
- `Occupancy & leased-rate integrity` — **CRITICAL** badge — `−10 pts · Occupancy & Vacancy`
- `Capital-expenditure & reserve adequacy` — **HIGH** badge — `−7.5 pts · Capital / Value-Add`
- `Missing due-diligence coverage` — **HIGH** badge — `−6 pts · Due Diligence`
- `Year-1 rent-growth aggressiveness` — **HIGH** badge — `−4.5 pts · Revenue / Rent`
A muted link at the bottom: `View Full Risk Report →`

**Card C — UNDERWRITING HIGHLIGHTS.** A label/value list with hairline dividers. Each row has the label on the left, the value bold and right-aligned, and directly beneath the value a **small muted uppercase provenance tag**:
- `Purchase Price` — `$136,410,200` — tag: `ASSUMPTION`
- `NOI — re-underwritten Year-1` — `$7,259,957` — tag: `CALCULATED`
- `Going-in Cap Rate` — `5.32%` — tag: `CALCULATED`
- `Levered IRR (5-yr hold)` — `10.17%` — tag: `CALCULATED`
- `Equity Multiple` — `1.58x` — tag: `CALCULATED`
- `Price per Unit` — `$625,735` — tag: `CALCULATED`
A muted link at the bottom: `Go to Underwriting →`

**3. Wide card — "NOI: BROKER CLAIM VS REALITY".** A clean three-bar vertical bar chart with the values labeled on or above each bar. This is the narrative centerpiece — give it visual weight:
- `T-12 Actual` — **$7,507,652** — blue bar — small tag `ACTUAL`
- `Seller Pro Forma` — **$7,564,085** — amber bar — small tag `SELLER`
- `Re-underwritten` — **$7,259,957** — a distinct blue/slate bar — small tag `CALCULATED`
Small muted caption beneath: `The gap between the seller's pro forma and PARITY's re-underwriting is the core story of this deal.`

**4. Bottom row — two cards:**

**Executive Summary** (wider): two columns.
- Left, header `KEY STRENGTHS` in green with green check icons: `Renovation / rent-premium substantiation`, `Leverage / LTV within target range`, `Debt yield above floor`, `Submarket supply / demand fundamentals`
- Right, header `KEY CONCERNS` in red with red warning icons: `NOI quality / manufactured NOI`, `Occupancy & leased-rate integrity`, `Capital-expenditure & reserve adequacy`, `Missing due-diligence coverage`

**Documents** (narrower): a single PDF file row — a red PDF icon, `Offering Memorandum.pdf`, `22.6 MB`, and a green `Parsed` chip. Beneath it, small muted italic text: `Single PDF ingested. Per-file status is not available.`

## Absolute rules — do not violate

This product's entire credibility rests on never displaying data it doesn't actually have. **Do NOT include any of the following**, even though dashboards often have them:

- No sparkline or trend mini-charts on metric cards (the API returns no time-series data)
- No market comparables panel, no comp properties, no comp photos
- No map view, no heatmap, no geographic visualization
- No recent-activity feed or timeline
- No "documents parsed" count, no processing time, no confidence score, no percentage-complete indicators
- No property photographs or building imagery anywhere in the UI
- No fabricated metrics, no invented KPIs, no placeholder lorem text
- Do not show the Deal Score twice
- Do not add a second, redundant upload form in the main content area

Every number in this mockup must be exactly one of the values specified above. Do not invent additional figures.

## Composition notes

Desktop web app viewport, 16:9. Crisp, legible UI text. Even 8-point spacing rhythm. Balanced whitespace — dense enough to feel like a real analytical tool, airy enough to feel premium. Straight-on flat UI view (not an angled device mockup, not a laptop frame, not a perspective render). The image should look like an actual screenshot of a shipped product.
