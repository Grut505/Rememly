## Context

`PdfGenerateModal.tsx` currently holds all Blurb per-export parameters as local component state (format, cover type, paper type, 3 colors, back cover style, spine text, spine font size), submitted into `options_json` on job creation. `Settings.tsx` already holds three global Blurb values via the generic `config` table (`blurb_mode_enabled`, `blurb_measurement_units`, `blurb_back_cover_mosaic_max_photos`) and already calls `pdfApi.previewCover` once with a fixed set of options. `render_pdf_chunks.py` and `render_cover_preview.py` both just read `blurb_*` keys off a plain `options`/`config` dict - they have no opinion on where those values were sourced from in the frontend. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Move parameter *ownership* from per-export state to global Settings config, with zero backend/render-script changes beyond the preview page-count passthrough.
- Let one generation request produce a Normal job, a Blurb job, or both, reusing the existing single-job pipeline unchanged for each.
- Make the cover preview's two representations explicit, separate actions, and let the Blurb one simulate a page count.

**Non-Goals:**
- No change to how a single job is rendered, merged, delivered, or flagged (that pipeline is correct and untouched, see the archived `pdf-cover-blurb-export` delivery/flagging requirements).
- No new "batch" or "linked pair of jobs" concept in the data model - the two jobs created by "Both" are ordinary, independent `jobs_pdf` rows with no foreign relationship between them beyond having been requested together.
- No change to `pdf-blurb-print-spec` or `pdf-interior-blurb-layout` geometry/layout behavior.

## Decisions

**New config keys, same generic table.** Nine new `config` keys (`blurb_format`, `blurb_cover_type`, `blurb_paper_type`, `blurb_front_bg_color`, `blurb_back_bg_color`, `blurb_spine_bg_color`, `blurb_back_cover_style`, `blurb_spine_text`, `blurb_spine_font_size_cm`) follow the exact pattern already used for `blurb_mode_enabled` etc. No migration. `Settings.tsx` loads/saves them with the same `value`/`initial<Value>`/`isDirty`/`handleSave` pattern as every other setting on that screen.

**"Both" is a frontend orchestration, not a backend feature.** Because interior page dimensions differ between Normal (A4-ish) and Blurb (chosen trim size), one render job cannot produce both - this is already true today and unchanged. "Both" is implemented purely in `PdfGenerateModal.tsx`'s submit handler: fetch the current Blurb config values, then call `pdfApi.create` + `pdfApi.process` twice - once with no `blurb_*` options (Normal job) and once with them included (Blurb job) - for the same `from`/`to` range. Each call is independent; if one fails (e.g. GitHub dispatch error), the other is unaffected and the user sees per-job errors in the existing job list, not a combined all-or-nothing failure.

**Values are fetched at generation time, not held in the modal's own state.** `PdfGenerateModal.tsx` fetches the 9 new config keys (plus the existing 3) via `configApi.get` when Blurb mode is on and the user opens the export flow, the same way it already fetches `blurb_mode_enabled`/`blurb_measurement_units` today. This keeps the modal a thin reader of Settings rather than a second source of truth.

**Preview page count is transient, not persisted.** The Blurb preview's page-count slider is local UI state in `Settings.tsx`, not a new config key - it exists purely to parameterize a single preview click and has no meaningful "saved" value between sessions. `render_cover_preview.py` reads it from the preview's `options` payload (`blurb_preview_page_count`, defaulting to `blurb_print_spec.PAGE_COUNT_MIN` if absent) exactly like every other per-preview option, so no new endpoint or schema is needed.

**Spine-fit warning logic moves with its inputs.** The pre-generation spine-text-fit check (existing `ConfirmDialog`) still runs in `PdfGenerateModal.tsx` right before submitting a Blurb or Both request, using the fetched Settings values and the live `monthCounts`-derived page-count estimate - unchanged in mechanism, only its inputs now come from `configApi.get` instead of local state.

## Risks / Trade-offs

[Both mode's two jobs are visually unrelated in the job list, which could confuse a user who only remembers clicking "Generate" once] → Both jobs share the same date range, which is already shown per row; no further linking (e.g. a shared batch id) is introduced since it isn't needed for any behavior in this change - revisit only if real usage shows this is confusing.

[Fetching 12 config keys synchronously before showing the export flow adds a round trip] → Already true today for the 3 existing keys (a `Promise.all` of `configApi.get` calls); adding 9 more to the same `Promise.all` has no meaningful latency impact.

[If the user changes Settings after opening the export modal but before generating, the modal's already-fetched values go stale] → Fetch happens once per modal open (existing behavior for the current 3 keys); acceptable since Settings changes mid-export-flow are rare and the same staleness already exists today for `blurb_mode_enabled`.

## Migration Plan

No data migration. Existing `options_json` blobs from before this change keep their per-job `blurb_*` values and continue to render correctly if ever re-read (e.g. for debugging) - only new jobs stop carrying user-edited-per-export values and instead carry a snapshot of whatever Settings held at generation time. Deploy order: ship `render_cover_preview.py`'s page-count passthrough and the frontend changes together (both are read-only-compatible with the current `options_json` shape, no backend/Worker changes required, no redeploy ordering constraint).
