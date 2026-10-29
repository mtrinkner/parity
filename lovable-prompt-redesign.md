# PARITY — full frontend redesign (single Lovable prompt)

**Attach both images**, then paste everything below the line.
- **Image 1** = dashboard layout reference
- **Image 2** = PARITY design system

---

Keep all existing functionality, routes, state management, backend integration, API calls, and data logic exactly as they are. **This is a complete visual redesign only.** Do not modify the backend, the OM parser, the underwriting engine, the risk engine, or any workflow. Do not remove features. Do not regenerate architecture.

I've attached two reference images:
- **Image 1 — dashboard layout.** Replicate its structure, card hierarchy, spacing, and proportions.
- **Image 2 — the PARITY design system.** This is the authoritative source for colors, typography, icons, buttons, badges, components, microinteractions, and empty states. Apply it consistently across every screen.

⚠️ **Both images contain fictional placeholder data from a different property** — a 312-unit garden-style complex in Charlotte NC, $3,412,000 NOI, 1.38x DSCR, 82/100. Do **not** copy any number, address, unit count, score, or property characteristic. All data comes from the live API. Copy the *design*, never the *content*.

Also **omit these elements from Image 1** — they belong to an unrelated marketing template: the "Services / About / Case Studies / Book a Call" top navigation, the "Book a Strategy Call" CTA, the AI-consultancy chat script about automation opportunities and industry selection, the six pitch cards along the bottom ("Human in the loop," "Fixed monthly rate," "Automation board," etc.), and the scattered decorative geometric shapes.

## DESIGN TOKENS (exact — do not approximate)

**Color**
```
Primary        #0F172A      Secondary      #1E293B
Background     #F8FAFC      Card           #FFFFFF
Border         #D1D5DB      Muted text     #64748B      Dark text  #111827
Success        #22C55E      Primary blue   #2563EB
Warning        #FACC15      Accent orange  #F97316
Danger         #EF4444      Accent purple  #8B5CF6      Accent cyan #06B6D4
```

**Typography — Inter**
```
Display 1   Bold 40/48        Body 1     Regular 16/24
Display 2   Bold 32/40        Body 2     Regular 14/20
Heading 1   SemiBold 24/32    Caption    Regular 12/16
Heading 2   SemiBold 20/28    Overline   Medium 10/14
Subtitle 1  Medium 16/24
Subtitle 2  Medium 14/20
```

**Icons** — Lucide, 24px, 2px stroke, rounded, minimal. Each metric icon sits in a small tinted rounded-square container using its own accent color.

**Cards** — `#FFFFFF` on `#F8FAFC`, ~2px `#D1D5DB` border, rounded ~16–20px, hard offset drop shadow (solid, offset down-right — not a soft blur). This shadow is the defining detail; get it exact.

**Risk badges** — `HIGH` red · `MEDIUM` orange · `LOW` yellow · `GOOD`/`PASS` green. Pill shape, tinted background, bold uppercase label.

**Status indicators** — colored dot + label + sublabel: Parsing OM (blue) · Analyzing (purple) · Complete (green) · Warning (orange) · Critical (red).

**Severity color is reserved and never decorative.** `CRITICAL` red · `HIGH` orange · `MEDIUM` amber · `LOW` yellow · `PASS` green · `INSUFFICIENT_DATA` grey. Nothing else gets color.

## LAYOUT

**Left sidebar** (fixed, white, right border):
- PARITY logotype + "AI-Powered Multifamily Deal Screening" tagline
- Nav: Dashboard · Executive Summary · Underwriting · Risk Engine · Market Analysis · Reports · Documents · AI Analyst · Settings — Lucide icon per item; active item has tinted background, colored left indicator, colored label
- **Current Deal** card: property thumbnail (extracted from the OM), name, address, units • year built
- **Upload New OM** button, outlined, full width

**Main area:**

1. **Header** — green `ANALYSIS COMPLETE` pill · property name in Display 1 · metadata row with location pin: address · units · year built · asset class, vertical dividers between.

2. **Metric card row** — five cards, each: tinted icon square, Overline label, Display 2 value, delta line with arrow:
   - **NOI (Year 1)** → `noiUnderwritten`, delta vs `noiSeller`, "vs seller pro forma"
   - **Cap Rate (Year 1)** → `capRateUnderwritten`, delta vs `capRateSeller`, "vs seller"
   - **Occupancy** → `occupancyPhysical`, delta vs `occupancyLeased`, "vs leased" — render this delta in Danger red, it's a flagged risk
   - **DSCR (Year 1)** → `dscrIO`, delta vs `dscrAmortizing`, "once amortizing"
   - **Deal Score** → `score` as `43 /100`, `verdict` beneath in its severity color

3. **Three-column row** — equal height, icon + Overline title, footer link:
   - **EXECUTIVE SUMMARY** — generated paragraph from property + verdict data · **KEY STRENGTHS** (green checks, from `passes`) · **KEY CONCERNS** (red icons, from top `flags`) · `RECOMMENDATION` row with `verdict` in a severity pill
   - **RISK ENGINE SUMMARY** — the five highest-severity `flags`: rule ID chip (`R05`), rule name, one-line description, right-aligned severity badge. "View Full Risk Report →"
   - **UNDERWRITING HIGHLIGHTS** — label/value list with hairline dividers: Purchase Price · NOI (Year 1) · Cap Rate · Levered IRR · Equity Multiple. "Go to Underwriting →"

4. **Bottom row** — two cards:
   - **PROPERTY PHOTOS** ("Extracted from OM") — horizontal image strip from the uploaded PDF, "View All Photos →"
   - **DOCUMENTS** — the uploaded OM with file size, plus each `insufficientData` item as an outstanding requested document in a distinct "requested" state

5. **AI Analyst panel** — right side, floating, collapsible. Header with minimize control, scrollable messages, input with send button. Opening line: *"I'm the PARITY analyst. Ask me about this deal's risks, underwriting, or the flags we raised."* The chat backend is not built — reply honestly that conversational analysis is coming soon and point to the live screening data. **Never fabricate deal answers.**

## CHARTS — build only these (they have real data)

- **Deal Score gauge** — donut/arc filling to `score`, verdict label beneath
- **Risk distribution donut** — `counts` by severity, using the severity palette
- **NOI comparison bars** — three bars: `noiT12` (actual) · `noiSeller` (seller pro forma) · `noiUnderwritten` (re-underwritten). This gap is the core story of the deal; make it the most prominent chart on the Underwriting screen.
- **Score impact bars** — top flags ranked by `pointsLost`, showing what cost the deal its score

**Do not build** the line chart, heatmap, or map view from Image 2 — the API returns no time-series, grid, or geocoded data for them, and inventing it would fabricate analysis. Omit them entirely rather than filling them with placeholder data.

## DATA BINDING

All values come from the existing API response. Never hardcode.

- `pct` values are decimals — `0.0532` → `5.32%`
- `usd` → `$7,259,957` · `x` → `1.42x` · `usd_month` → `$3,073/mo`
- Financial figures use tabular numerals, right-aligned in lists
- Every metric shows its `provenance` as an Overline-style muted tag: `actual` · `seller` · `calculated` · `assumption`
- Missing value → explicit **"Insufficient Data"** state naming what's required. Never a dash, zero, or invented number.
- Arrays vary per deal — render whatever returns

## EMPTY & PRE-UPLOAD STATES

Use the empty-state pattern from Image 2 — isometric line illustration, heading, one-line explanation, primary CTA:
- **No deal yet** → "Upload an Offering Memorandum to get started" + Upload New OM
- **No documents** → "No documents available for this deal"
- **No results** → "We couldn't find any data matching your criteria" + Adjust Filters

Before upload: a clean centered upload experience in the same card system. No example property, no placeholder apartment, no stock photography, no fabricated metrics.

## MOTION

Per Image 2's microinteractions. CSS transforms only. Respect `prefers-reduced-motion`.

- **Button fold** — every primary button folds like paper on hover: a layered panel rotates in 3D revealing a second color, with a folded corner. Blue→yellow, green→white, yellow→white, red→deep red. Use `perspective`, subtle `rotateX/Y`, shadow shift, spring easing. **Never a plain color fade.**
- **Card hover** — lift ~2px, deepen the hard shadow, brighten slightly
- **Nav active** — indicator slides smoothly between items
- **Count up** — metrics animate to value on load
- **Progress fill** — score gauge and bars animate in
- **Stagger reveal** — list items and risk badges appear in sequence
- **Scroll** — sections fade upward with staggered children, premium easing, no hard pop-ins
- **Photo gallery** — hover: slight zoom, brighten, shadow grows; click: lightbox
- **AI panel** — messages animate in, typing indicator with dots, input expands on focus
- **Background** — faint animated gradient, slow ambient drift, subtle parallax. Keep it quiet; readability always wins.

## PERFORMANCE

Transform and opacity only. No layout thrash. Lazy-load gallery images. Desktop and tablet: sidebar collapses to icons under 1280px, metric row wraps to a grid, three-column row stacks.
