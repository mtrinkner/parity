# Fix hero scroll glitches (paste into Lovable)

Keep everything else exactly as-is — routes, upload logic, dashboard, backend calls. This is a targeted fix to the cinematic hero only.

## Bug 1: Scroll-scrubbed video looks stuttery/janky during real scrolling

The scroll-to-time mapping itself is correct (verified: currentTime advances smoothly and monotonically with scroll position, no jumps or resets). The stutter is a known issue with this technique: writing `video.currentTime` on every scroll/rAF tick forces the browser to re-seek the video decoder constantly, which is visibly janky even though the underlying math is right.

Fix:
- Only write `video.currentTime` when the difference between the current lerp value and the video's actual `currentTime` exceeds a small threshold (e.g., `Math.abs(target - video.currentTime) > 0.04`) — don't write on every rAF tick if the delta is negligible.
- Keep the lerp factor gentle (around 0.1–0.15) so the interpolation stays smooth rather than snapping.
- If the browser supports it, prefer `requestVideoFrameCallback` for the video's own frame timing instead of purely relying on `requestAnimationFrame` for the seek target.
- Make sure the scroll listener is passive and doesn't do any other expensive work per tick (no layout reads mixed with writes — batch DOM reads before writes to avoid forced reflow).

## Bug 2: Overlay text ("PARITY" wordmark, "SCROLL TO BEGIN") shows a double/ghosted appearance during fade transitions

This is a single DOM element, not two — the doubling is a visual artifact of the fade animation itself. Check for:
- A `text-shadow` or duplicate pseudo-element (`::before`/`::after`) that's supposed to be a subtle glow but is rendering as an offset duplicate.
- A CSS transition animating both `opacity` AND a `transform` (e.g., scale or translate) where the two properties are out of sync during the transition, creating a smeared/doubled look — if so, animate opacity alone, or make sure transform and opacity use the exact same timing function and duration.
- If it's a crossfade between two different overlay states, confirm the outgoing element is fully `opacity: 0` (or unmounted) before or exactly as the incoming one reaches `opacity: 1` — no window where both are partially visible at meaningfully different positions.

## Bug 3: Scrolling past the video's end lands on a blank dark page instead of stopping cleanly at the upload screen

The scroll container is taller than the content needs — there's dead scroll space after the intended hero → upload handoff point. Fix:
- Clamp the scroll listener's progress calculation to `[0, 1]` and once progress reaches 1 (or the handoff has fired), either lock/release scroll so the page settles at the upload screen, or reduce the scroll container's height to match exactly where the handoff should occur — no extra empty space below it.
- Confirm the handoff transition (crossfade into the upload screen) triggers reliably at progress ≈ 1, not at some earlier point that leaves a gap of empty scroll before the container's actual end.

## Verify before finishing

Scroll through the entire hero at a normal, continuous pace (not step-by-step) and confirm: no visible stutter, no ghosted/doubled text during fades, and scrolling to the very bottom of the hero lands cleanly on the upload screen with no blank page in between.
