## 1. Settings: new persisted Blurb parameter config keys

- [x] 1.1 Added 9 new `config` keys and their `value`/`initial<Value>` state pairs to `Settings.tsx`: `blurb_format`, `blurb_cover_type`, `blurb_paper_type`, `blurb_front_bg_color`, `blurb_back_bg_color`, `blurb_spine_bg_color`, `blurb_back_cover_style`, `blurb_spine_text`, `blurb_spine_font_size_cm` - following the exact pattern of the existing `blurb_mode_enabled`/`blurb_measurement_units`/`blurb_back_cover_mosaic_max_photos` keys (loaded in `loadBlurbSettings()`, included in `isDirty`, saved via the existing `handleSave` `Promise.all`, initial values set post-save)
- [x] 1.2 Moved the format/cover-type/paper-type selector UI, the 3 background color pickers, the back-cover-style choice, and the spine text input + font-size `Slider` from `PdfGenerateModal.tsx` into `Settings.tsx`'s "Blurb print-ready mode" section, nested under the existing master toggle alongside units and mosaic-cap
- [x] 1.3 Removed the corresponding state/UI from `PdfGenerateModal.tsx`; it now only keeps a read-only `BlurbSettings` object fetched from Settings, used for the mode selector and the pre-generation spine-fit check

## 2. Settings: two explicit preview actions + page-count slider

- [x] 2.1 Replaced the single "Preview PDF" button with two explicit actions: "Preview (normal)" and "Preview (Blurb)" - the Blurb one only shown when Blurb mode is enabled
- [x] 2.2 Added a page-count `Slider` (bounded `PAGE_COUNT_MIN`-`PAGE_COUNT_MAX`, step `PAGE_COUNT_STEP` - new constant added to `blurbPrintSpec.ts` mirroring the Python module) shown above the Blurb preview action, as local component state (not persisted)
- [x] 2.3 "Preview (normal)" calls `pdfApi.previewCover` with the existing digital-cover options only (no `blurb_mode_enabled`)
- [x] 2.4 "Preview (Blurb)" calls `pdfApi.previewCover` with `blurb_mode_enabled: true`, the 9 Settings-backed values, and `blurb_preview_page_count` set to the slider's current value
- [x] 2.5 `scripts/render_cover_preview.py`: replaced the hardcoded `BLURB_PREVIEW_PAGE_COUNT` constant with `resolve_preview_page_count(options)`, which reads `options['blurb_preview_page_count']` and clamps defensively into `[PAGE_COUNT_MIN, PAGE_COUNT_MAX]`

## 3. PDF export flow: generation-mode selection

- [x] 3.1 `PdfGenerateModal.tsx` shows a Normal/Blurb/Both selector when Blurb mode is enabled; when disabled, no selector renders and the flow is unchanged
- [x] 3.2 On mount, fetches all 12 Blurb config keys (3 existing + 9 new) via a single `Promise.all` of `configApi.get` calls, same pattern as before
- [x] 3.3 The spine-fit `ConfirmDialog` check now reads from the fetched `BlurbSettings` object instead of local per-export state, and only runs when the selected mode includes Blurb (`includesBlurb`)
- [x] 3.4 Submission logic implemented in `handleGenerate`: Normal and/or Blurb branches each call `startGeneration` independently (sequentially awaited, not parallel, to avoid corrupting the shared zustand store's singleton generation state); "Both" runs both branches for the same date range and calls `onComplete` once per created job
- [x] 3.5 Confirmed no changes needed in `workers/src/routes/pdf.ts`, `render_pdf_chunks.py`, or `merge_pdf_from_drive.py` - each job already renders/delivers/flags independently; verified by grepping `pdf.ts` for `blurb` (only the pre-existing `is_blurb` flag logic from the prior change, nothing new needed)

## 4. Verification

- [x] 4.1 `tsc --noEmit` clean on both `frontend` and `workers`
- [x] 4.2/4.3 Verified by code review only (see caveat below) - `blurbModeEnabled` gates the Settings parameter section, both preview actions, the page-count slider, and the export flow's mode selector consistently, matching the pre-existing pattern used for the same flag before this change
- [ ] 4.4 **Not verified** - requires a real logged-in session and live GitHub Actions dispatch, unavailable in this sandbox (see caveat)
- [x] 4.5 Verified numerically and via real Playwright render: spine width strictly increases with simulated page count (20 pages → 0.0625in, 300 → 0.75in, 550 → 1.375in for Softcover/100# Gloss); a real cover-wrap render at a custom simulated page count (300) produces correct `blurb-cover-canvas` markup; `resolve_preview_page_count` correctly clamps out-of-range/malformed inputs

**Caveat**: this sandbox has no authenticated frontend session (Google OAuth) and no way to click through the actual React UI or trigger real GitHub Actions jobs. Verification here is: `tsc --noEmit` (both packages), direct code review of the moved/added state and JSX, and real Playwright-rendered/pikepdf-measured or numerically-checked Python logic for everything that doesn't require the browser or GitHub Actions. A genuine end-to-end click-through (Settings → configure Blurb params → PDF export → Both mode → two jobs appear correctly flagged) has **not** been performed and is recommended before relying on this in production.
