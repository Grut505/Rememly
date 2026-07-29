## 1. Print-spec constants (`pdf-blurb-print-spec`)

- [x] 1.1 Verify Standard Portrait (8×10in) bleed/safe-zone/spine numbers against RPI Print's template generator (same method used for Magazine Premium: select the format/cover type in the widget, download the template, cross-check the Detailed Measurements table)
- [x] 1.2 Verify the Hardcover spine lookup table and Softcover formula for the three non-default paper types (100# Dull, 100# Eggshell, 70# Uncoated), not just 100# Gloss - found and corrected a real spec bug: the Softcover formula's divisor is paper-type-specific (400/360/250/410), not universal
- [x] 1.3 Create the constants module (`scripts/blurb_print_spec.py`) with: trim sizes per format, bleed per cover type, safe-zone margin, barcode area (size + margins from trim), the Softcover spine formula (per paper type), and the four Hardcover spine lookup tables - stored in inches (the source of truth) with a cm conversion helper, RPI source noted in the module docstring
- [x] 1.4 Add a full-cover-dimension helper (`panel_dimensions_in`/`full_cover_dimensions_in`) and validate against all verified scenarios (Softcover and Hardcover, both formats, matching confirmed numbers: Magazine Premium 17.313×11.250in / 19.266×12.750in, Standard Portrait 16.313×10.250in / 18.266×11.750in) - all match to floating-point rounding
- [x] 1.5 Add page-count-bounds constants (20-550, step 2) to the module, shared by both the interior-layout and cover-export capabilities

## 2. Global settings

- [x] 2.1 Add `blurb_mode_enabled` config key (boolean, default off) using the existing generic `config` key-value table, following the `auto_date_from_photo` pattern
- [x] 2.2 Add `blurb_measurement_units` config key (`inches` | `centimeters`, default inches)
- [x] 2.3 Add `blurb_back_cover_mosaic_max_photos` config key (integer, `-1` = no cap; defaulted to 200)
- [x] 2.4 Add the three corresponding controls to the Settings screen (toggle, unit selector, mosaic-cap input), following existing Settings UI patterns

## 3. Interior page layout (`pdf-interior-blurb-layout`)

- [x] 3.1 Parametrize `PAGE_CSS`'s `@page` size (now `build_page_css()`) and the hardcoded height/width constants (now `PAGE_CONTENT_WIDTH_CM`/`PAGE_CONTENT_HEIGHT_CM`) to accept a format's trim dimensions, defaulting to today's A4 constants when Blurb mode is off
- [x] 3.2 Confirmed `page_counts[key] = 1 + ceil(len(month_articles)/2)` is a pure function of article count, unaffected by page-size changes; `total_pages` is computed early in `main()`, before any chunk renders
- [x] 3.3 Implemented odd-page padding: a blank `.articles-page` chunk is appended after the last month chunk when `total_pages` is odd
- [x] 3.4 Mirrored the page-count formula and full spine-width calculation in TypeScript (`frontend/src/utils/blurbPrintSpec.ts`), used directly by the frontend rather than routed through a new Worker endpoint (simpler - the frontend already has the `monthCounts` data needed, no round trip adds value)
- [x] **Found and fixed a critical, pre-existing bug**: `render_html_to_pdf` never passed `prefer_css_page_size=True` to Playwright's `page.pdf()`, so the `@page` CSS size was always silently ignored in favor of a fixed Letter (8.5×11in) default - true even before Blurb mode existed. Confirmed by rendering a real PDF with and without the flag and measuring the output MediaBox. Fixed; today's "A4" pages now measure true A4 (8.268×11.693in) instead of Letter.

## 4. Cover-wrap generation (`pdf-cover-blurb-export` + `pdf-blurb-print-spec`)

- [x] 4.1 Implemented `generate_blurb_cover_html(...)`: assembles back-panel + spine + front-panel into one flat HTML canvas sized via the full-cover-dimension helper (task 1.4), with its own `@page` CSS block
- [x] 4.2 Front panel: calls the existing `generate_cover_mosaic` / `generate_cover_masked_mosaic` functions with the wrap's front-panel width/height (via a temporary `set_page_dimensions` save/restore, since those functions read the page-size globals rather than taking width/height params), reusing today's front-cover configuration unchanged
- [x] 4.3 Back panel - solid color style: renders the chosen background color, with the reserved barcode area always white regardless
- [x] 4.4 Back panel - mosaic style: calls `smart_mosaic_layout` with photos from the exported date range, capped by `blurb_back_cover_mosaic_max_photos` (-1 = uncapped) - verified both capped and uncapped behavior with mocked images
- [x] 4.5 Spine: renders the chosen background color; spine text only renders if it fits legibly at the computed spine width, otherwise color-only
- [x] 4.6 Per-zone background colors (front/back/spine, default white) wired into all three panel renderers
- [x] 4.7 Renders the assembled HTML to PDF via `render_html_to_pdf`, uploaded as its own `cover_wrap.pdf` chunk
- [x] **Found and fixed a real bug**: the spine text, rotated -90deg onto the spine, was positioned at `left:0`, which (given how CSS rotation around `transform-origin: left bottom` shifts the box) pushed it off-page entirely - invisible in every render. Fixed by centering it relative to the spine width instead; confirmed visually (screenshot) that "Famille Martin" now renders correctly centered on the spine.
- [x] Also caught and fixed: the front-cover-panel container was missing its bleed-extension on the outer edge (a visible un-rendered gap at the trim edge farthest from the spine); the back-cover barcode-area's bottom margin was measured from the bleed edge instead of the trim edge. Both corrected and consistent with the verified numeric constants.

## 5. Frontend export UI

- [x] 5.1 In the PDF export options step, conditionally reveals a "Print-ready cover for Blurb" section when `blurb_mode_enabled` is on, no changes visible when off
- [x] 5.2 Format, cover type, and paper type selectors added (no page-count field - derived automatically)
- [x] 5.3 Per-zone background color pickers (front/back/spine, defaulting to white)
- [x] 5.4 Back-cover style choice (solid color vs. full-album mosaic)
- [x] 5.5 Spine text field and font-size control
- [x] 5.6 Live spine-width feedback (via the TS mirror from task 3.4), shown in the user's preferred unit
- [x] 5.7 Warning dialog (`ConfirmDialog`) before generation if spine text won't fit at the estimated spine width, requiring explicit confirmation to proceed
- [x] 5.8 Out-of-range validation message is surfaced via the existing generic job-progress/status notification mechanism (the render script's `report_status` call), no new dedicated UI needed

## 6. Backend/job wiring

- [x] 6.1-6.3 **No code changes needed** - confirmed by reading `pdf.ts` and the render script: `options_json` is already a free-form JSON blob passed through verbatim (`JSON.stringify(body.options || {})` on create, `select *` on fetch), and the GitHub Actions dispatch only ever passes `job_id` as a workflow input - the render script fetches the full job (including all options) itself via the existing callback API. The new Blurb option keys flow through this existing generic plumbing automatically.

## 7. Delivery

- [x] 7.1 Extended `scripts/merge_pdf_from_drive.py`: `list_pdf_files` now excludes `cover_wrap.pdf` by name (so it's never merged into the album PDF); a new `move_cover_wrap_if_present` moves it separately to the same destination as the merged album PDF, renamed `cover_blurb_<timestamp>.pdf`. Verified with a mocked Drive service (rename + move calls, and the not-present no-op case).
- [x] 7.2 Interior/whole-album PDF delivery path otherwise unchanged - confirmed by reading the surrounding merge logic, no other changes made to it.

## 8. Verification

- [x] 8.1 Generated a REAL cover-wrap PDF (Magazine Premium, Softcover, 100# Gloss, 300 pages) via Playwright locally and measured its actual MediaBox with pikepdf: **18.000in × 11.250in, exact match** to the constants module's prediction.
- [x] 8.2 Repeated for Hardcover (dimension formula verified via unit tests against RPI's live data for both formats in task 1); a real Standard Portrait interior page was also generated and measured (see 8.7) - exact match.
- [x] 8.3 Odd-page-count padding and out-of-range logic verified via direct scenario tests (odd count correctly padded to even; too-few-pages correctly flagged out of range).
- [x] 8.4 Out-of-range handling verified at the logic level (see 8.3); the `main()` wiring generates the interior/whole-album PDF regardless and only skips the cover-wrap step when out of range, with a descriptive status message.
- [x] 8.5 Spine-too-narrow-for-text path verified: a small page count (20 pages, thin spine) with a 2cm font correctly omits the text from the rendered HTML; the frontend shows the same estimate-based warning before generation.
- [x] 8.6 Confirmed via `build_page_css()` default-vs-custom assertions, and via a real generated PDF measurement, that Blurb-mode-off output uses the (now-fixed) A4 default unchanged from any Blurb-specific code path.
- [x] 8.7 Generated a REAL interior month-chunk PDF at Standard Portrait dimensions via Playwright and measured it: **8.000in × 10.000in, exact match**. Did not do a broader visual-quality pass across many photo/text combinations at the new aspect ratios - recommend a real end-to-end test (per the note below) before considering the feature fully shipped.

**Important caveat**: everything above was verified locally (unit-style logic checks, and REAL PDF generation + measurement via Playwright/pikepdf where noted) - this sandbox has no Google Drive credentials, no live D1 articles, and no way to trigger/observe the actual GitHub Actions `pdf-render.yml`/`pdf-merge.yml` workflows. A genuine end-to-end run (real family album data, real Drive upload, real GitHub Actions job) has **not** been performed and is strongly recommended before relying on this in production.
