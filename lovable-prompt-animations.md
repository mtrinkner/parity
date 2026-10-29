# PARITY — animations-only pass (paste as-is into Lovable)

Keep all existing routes, components, state, styling, colors, layout, and backend integration exactly as they are. **This is a motion-only pass.** Do not change any visual design, copy, data logic, or API calls — only add/fix animations. CSS transforms and opacity only — no layout-thrashing properties. Respect `prefers-reduced-motion` globally: when it's set, disable every animation below and render final states immediately.

## Load-in sequence (every route, on mount)

- Cards fade in + slide up slightly (~8px), staggered ~50-80ms apart in reading order (top-to-bottom, left-to-right).
- Metric values (NOI, Cap Rate, Occupancy, DSCR, Deal Score, all Underwriting figures) **count up** from 0 to their final value over ~800ms, using an ease-out curve. Currency and percentage formatting applies only once the count-up settles (or format live during the count if that's cheaper — either is fine, just no flash of unformatted raw numbers).
- Route transitions fade the outgoing view down slightly while the incoming view fades/slides up — no hard cuts between pages.

## Score gauge + charts

- **Deal Score gauge** (Dashboard + Executive Summary): the circular/arc gauge animates its fill from 0 to the score value over ~1s, synced with the count-up number in the center. Verdict label fades in after the gauge settles.
- **Risk distribution donut** (Risk Engine): segments sweep in sequentially by severity (Critical → High → Medium → Low → Insufficient Data → Pass), not all at once.
- **NOI comparison bars** (Underwriting): the three bars (T-12 actual, seller pro forma, re-underwritten) grow from zero height, staggered left to right, ~150ms apart.
- **Score impact bars** (Risk Engine): bars grow from zero width in ranked order, top (largest point loss) first.

## Hover / interaction motion

- **Card hover**: lift ~2px, deepen the existing hard-offset shadow, slight brightness increase. Spring-style easing, not linear.
- **Primary button "fold"**: on hover, the button folds like a corner of paper lifting — a layered panel rotates in with `perspective`/`rotateX` or `rotateY`, revealing a second color underneath with a folded-corner shadow. This must never be a plain background-color fade — it needs the actual 3D fold. Map per current button color: primary blue → yellow reveal, success green → white, warning yellow → white, danger red → deep red.
- **Nav active indicator** (sidebar): when switching routes, the colored left-indicator bar slides smoothly to the new active item rather than jumping.
- **Risk flag rows** (Risk Engine): expanding a row's "Why Flagged" panel animates open (height + fade), not an instant show/hide.

## Background

- Subtle, slow ambient gradient drift on the page background — barely perceptible, never distracting, never interferes with text contrast or readability.

## Verify before finishing

Reload the Dashboard and confirm: metric cards stagger in and count up, the Deal Score gauge fills and settles, hovering a metric card lifts it, and hovering a primary button shows the paper-fold effect (not a flat color swap). Then check that setting `prefers-reduced-motion: reduce` in devtools removes all motion and shows final states instantly.
