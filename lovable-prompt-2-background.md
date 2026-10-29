# PROMPT 2 — Dynamic property background (run only after Prompt 1 works)

Paste as-is. Written in the "preserve everything" form so it adds a feature without regenerating the app.

---

Keep all existing components, routes, state, styling, and backend integration exactly as they are. **Add one new feature only:** a per-deal property background extracted from the uploaded OM.

## Behavior

**Before upload:** unchanged — neutral gradient, no property imagery.

**On upload:** run image extraction **in parallel with** the existing analysis request. The two must be completely independent. The dashboard renders the moment the API returns; the background fades in whenever extraction finishes. **Image work must never block, delay, or fail the analysis.**

**Never bundle or hardcode a property image.** Every deal derives its own background. Never reuse one deal's image for another.

## How to extract (client-side)

Use **`pdfjs-dist`** on the `File` object the user dropped — you already have the PDF locally.

1. `pdfjs.getDocument({ data: arrayBuffer })`
2. For each of the **first 12 pages**: `page.getOperatorList()`, collect `OPS.paintImageXObject` and `OPS.paintJpegXObject` entries
3. For each image name: `page.objs.get(name)` → `{ width, height, data }`, **already decoded**
4. Draw to an offscreen canvas via `putImageData`, then `canvas.toDataURL('image/jpeg', 0.85)`

⚠️ **Critical:** the images embedded in these OMs are **JPEG 2000 (.jpx)**, which Chrome and Firefox **cannot decode natively**. Do **not** pull raw image bytes and assign them to an `<img src>` — it fails silently. pdf.js ships a JPX decoder, so you must go through pdf.js and out via canvas.

Extract the image **XObject**, not a page render. Page renders bake the OM's own overlaid headline text and broker logos into the background, which then collides with your UI type.

## Choosing the best image

Score every candidate, pick the highest:

- **Resolution** — require ≥ 1.5 MP, strongly prefer ≥ 3 MP
- **Aspect ratio** — prefer landscape 1.4–2.2; reject square and portrait
- **Page position** — earlier pages score higher (hero photography lives in the first pages)
- **Coverage** — prefer full-bleed images over small insets

These filters reject logos, headshots, icons, charts, and floor plans. (Verified on the test OM: 362 embedded images → 9 candidates → top pick is a 3.9 MP rooftop-pool shot at sunset.)

Keep the ranked candidate list in state so the user can cycle through alternatives.

## Presentation

Apply as the full-viewport Home background behind the glass UI: subtle blur, a dark gradient scrim for text legibility, gentle parallax on scroll, slow ambient drift. Fade in over ~600ms. Never let it reduce contrast on the UI above it.

## Progress states

Extend the existing loading sequence with the image stages, shown honestly as running concurrently with the analysis (not blocking it):

`Reading OM` → `Identifying property` → `Finding property imagery` → `Verifying image match` → `Building deal dashboard`

## Fallback

If no candidate clears the thresholds, keep the existing polished gradient. **Never** substitute a stock photo, an unrelated property, or a generated building.

## Persistence, audit, and user control

Store on the deal record alongside the analysis: the image data URL, plus provenance — `source: "om_extraction"`, OM page number, pixel dimensions, and the computed confidence score. Surface that provenance on hover or in Settings.

Give the user controls to **approve**, **cycle to the next-best candidate**, **upload their own image**, or **remove it** and revert to the gradient. Persist the choice with the deal.

## Do not add external image search

Do not call Google Places, Street View, web image search, or any third-party image API. A property name alone cannot be verified to a specific building — "Example Tower" matches properties in both Metro City CO and Charlotte NC. A confident-looking wrong building is worse than no image, and every fact this product displays must be traceable to a source. The OM always contains professional photography of the actual asset; extract from it, or show the gradient.
