## 1. Print-spec constants (`pdf-blurb-print-spec`)

- [ ] 1.1 Verify Standard Portrait (8×10in) bleed/safe-zone/spine numbers against RPI Print's template generator (same method used for Magazine Premium: select the format/cover type in the widget, download the template, cross-check the Detailed Measurements table)
- [ ] 1.2 Verify the Hardcover spine lookup table and Softcover formula for the three non-default paper types (100# Dull, 100# Eggshell, 70# Uncoated), not just 100# Gloss
- [ ] 1.3 Create the constants module (`scripts/blurb_print_spec.py` or equivalent) with: trim sizes per format, bleed per cover type, safe-zone margin, barcode area (size + margins from trim), the Softcover spine formula, and the Hardcover spine lookup table - all converted to centimeters at load time from the authoritative inch values, with the RPI source noted in a comment
- [ ] 1.4 Add a full-cover-dimension helper (`panelWidth`/`panelHeight`/`fullCoverWidth`/`fullCoverHeight` per design.md's formulas) and unit-test it against the two verified scenarios (Softcover and Hardcover, Magazine Premium, matching the numbers already confirmed: 17.313×11.250in and 19.266×12.750in)
- [ ] 1.5 Add a page-count-bounds constant (20-550, step 2) used by both the interior-layout and cover-export capabilities

## 2. Global settings

- [ ] 2.1 Add `blurb_mode_enabled` config key (boolean, default off) using the existing generic `config` key-value table, following the `auto_date_from_photo` pattern
- [ ] 2.2 Add `blurb_measurement_units` config key (`inches` | `centimeters`, default inches)
- [ ] 2.3 Add `blurb_back_cover_mosaic_max_photos` config key (integer, `-1` = no cap; pick a sane positive default, e.g. 200, to start)
- [ ] 2.4 Add the three corresponding controls to the Settings screen (toggle, unit selector, mosaic-cap input), following existing Settings UI patterns

## 3. Interior page layout (`pdf-interior-blurb-layout`)

- [ ] 3.1 Parametrize `PAGE_CSS`'s `@page` size and the hardcoded height/width constants (currently A4 / 27.7cm / 19cm) to accept a format's trim dimensions, defaulting to today's A4 constants when Blurb mode is off
- [ ] 3.2 Confirm the existing `page_counts[key] = 1 + ceil(len(month_articles)/2)` formula is unaffected by page-size changes (per design.md, it's a pure function of article count) and expose the computed `total_pages` value early, before chunk rendering begins
- [ ] 3.3 Implement odd-page padding: when `total_pages` at the chosen format is odd, generate and append one blank-page HTML chunk after the last month chunk
- [ ] 3.4 Mirror the page-count formula in TypeScript on the Worker (or reuse the existing month-count computation used for the export preview step), commented as intentionally duplicated with the Python implementation

## 4. Cover-wrap generation (`pdf-cover-blurb-export` + `pdf-blurb-print-spec`)

- [ ] 4.1 Implement `generate_blurb_cover_html(...)`: assemble back-panel + spine + front-panel into one flat HTML canvas sized via the full-cover-dimension helper (task 1.4), with its own `@page` CSS block
- [ ] 4.2 Front panel: call the existing `generate_cover_mosaic` / `generate_cover_masked_mosaic` functions with the wrap's front-panel width/height instead of A4's, reusing today's front-cover configuration (style, title, family name) unchanged
- [ ] 4.3 Back panel - solid color style: render the chosen background color across the panel, leaving the reserved barcode area (task 1.3 geometry) clear and always white
- [ ] 4.4 Back panel - mosaic style: call `smart_mosaic_layout` with every photo from the exported date range, capped by `blurb_back_cover_mosaic_max_photos`, sized to the back panel while respecting the safe zone and barcode area
- [ ] 4.5 Spine: render the chosen background color; if spine text and font size were provided AND the computed spine width is wide enough to fit them legibly, render the text, otherwise render color-only
- [ ] 4.6 Wire the per-zone background colors (front/back/spine, default white) into all three panel renderers
- [ ] 4.7 Render the assembled HTML to PDF via the existing `render_html_to_pdf` Playwright helper, upload as its own chunk (e.g. `cover_wrap.pdf`) alongside the existing chunks

## 5. Frontend export UI

- [ ] 5.1 In the PDF export options step, conditionally reveal a "Print-ready cover for Blurb" section when `blurb_mode_enabled` is on, with no changes visible when it's off
- [ ] 5.2 Add format, cover type, and paper type selectors (no page-count field - it's derived automatically)
- [ ] 5.3 Add per-zone background color pickers (front/back/spine, defaulting to white)
- [ ] 5.4 Add the back-cover style choice (solid color vs. full-album mosaic)
- [ ] 5.5 Add the spine text field and font-size control
- [ ] 5.6 Show live spine-width feedback (using the TS page-count mirror from task 3.4) as format/cover-type/paper-type/page-count-affecting choices change, in the user's preferred unit (task 2.2)
- [ ] 5.7 Before generation, if spine text won't fit at the computed spine width, show a warning dialog explaining the text will be omitted, requiring explicit confirmation to proceed
- [ ] 5.8 After generation, surface the validation message when the actual page count falls outside the supported range (cover skipped, interior PDF still delivered)

## 6. Backend/job wiring

- [ ] 6.1 Extend the PDF job's `options_json` schema (informally, no DB migration) with the new keys: format, cover type, paper type, per-zone colors, back-cover style, spine text/font size
- [ ] 6.2 Pass `blurb_mode_enabled` and the new options through job creation (`workers/src/routes/pdf.ts`) to the render step
- [ ] 6.3 Update `.github/workflows/pdf-render.yml` (and `pdf-preview.yml` if the preview step needs the new options) to pass through any new parameters

## 7. Delivery

- [ ] 7.1 Extend `scripts/merge_pdf_from_drive.py` to detect the `cover_wrap.pdf` chunk (if present) and move it via the existing `driveMoveFile` mechanism into the same destination folder as the merged album PDF, under a distinct filename (e.g. `<job-name>-cover-blurb.pdf`)
- [ ] 7.2 Confirm the interior/whole-album PDF delivery path is otherwise unchanged when Blurb mode is on (only its page dimensions differ)

## 8. Verification

- [ ] 8.1 Generate a real end-to-end test PDF + cover-wrap (Magazine Premium, Softcover) for a real date range and verify the cover-wrap's dimensions/bleed/safe-zone with a PDF measurement tool against the constants from task 1.3-1.4
- [ ] 8.2 Repeat for Hardcover and for the Standard Portrait format
- [ ] 8.3 Test the odd-page-count padding path (a date range producing an odd interior page count)
- [ ] 8.4 Test the out-of-range page count path (very small and, if feasible, very large date ranges) and confirm the interior PDF still delivers while the cover is skipped with a clear message
- [ ] 8.5 Test the spine-too-narrow-for-text warning path
- [ ] 8.6 Confirm Blurb mode off (default) leaves today's export flow and output completely unchanged
- [ ] 8.7 Visually review interior article-page layout at the new aspect ratios (Magazine Premium 8.5:11, Standard Portrait 8:10 vs. today's A4 ~1:1.41) - the fixed "2 articles per page, 13.5cm max height" layout was tuned for A4 and hasn't been checked at the new proportions
