## Why

Today, all the Blurb print-ready cover options (format, cover type, paper type, per-zone colors, spine text/font, back cover style) live as ephemeral per-export state in the PDF export modal - they reset every time the modal opens, and there is no way to review or preview them without starting a real export. Meanwhile the export flow only offers a single on/off "Blurb mode" for the whole export, with no way to also get a normal album from the same request, and the Settings cover preview only shows one representation with a fixed, non-adjustable page count for the spine estimate. Family members configuring their print book want to set it up once, preview it in either mode, and choose per export whether they want the normal album, the Blurb book, or both - without re-entering the same details each time.

## What Changes

- Move all per-export Blurb parameters (format, cover type, paper type, front/back/spine background colors, back cover style, spine text, spine font size) from the PDF export modal into Settings, as persistent global values (same generic `config` table pattern as the existing Blurb settings).
- The PDF export flow no longer shows any Blurb parameter controls. Instead, when the master "Blurb mode" setting is on, it shows a single choice at generation time: **Normal**, **Blurb**, or **Both**. When the master setting is off, the flow is unchanged from today (Normal only, no selector shown).
- **Both** SHALL produce two independent PDF jobs from one generation request: a Blurb job (cover-wrap + Blurb-formatted content, no digital cover, delivered as a linked pair per the existing `pdf-cover-blurb-export` delivery requirement) and a Normal job (today's single merged album PDF, unaffected). Each job is flagged and named independently, using the existing per-job mechanisms - no new job-level mechanism is introduced by "Both" itself.
- Settings' cover preview becomes two explicit actions - "Preview (normal)" and "Preview (Blurb)" - instead of one button that silently depended on whatever mode happened to be configured.
- The Blurb preview adds a manual page-count slider (bounded by RPI Print's supported range, 20-550 in steps of 2) so the user can see the cover-wrap and spine width at a page count of their choosing, since Settings has no real interior content to derive a page count from. This value is only used for the preview and has no effect on any real export.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `pdf-cover-blurb-export`: relocates per-export parameter configuration to Settings; replaces the per-export parameter UI with a Normal/Blurb/Both generation-mode choice; adds the "Both" dual-job behavior; formalizes the cover preview (previously implemented but never specced) as two explicit actions with a manual page-count control for the Blurb one.

## Impact

- **Frontend**: `Settings.tsx` gains ~9 new persisted config fields (format, cover type, paper type, 3 background colors, back cover style, spine text, spine font size) and their UI controls (moved from `PdfGenerateModal.tsx`), a page-count `Slider` for the Blurb preview, and a second, explicit "Preview (Blurb)" button alongside today's preview button. `PdfGenerateModal.tsx` loses the entire "Print-ready cover for Blurb" parameter section and gains a Normal/Blurb/Both selector plus dual job-creation logic for "Both".
- **Backend**: `scripts/render_cover_preview.py` reads the simulated page count from `options` instead of a hardcoded constant. No changes needed to `render_pdf_chunks.py`, `merge_pdf_from_drive.py`, or `workers/src/routes/pdf.ts` - the per-job `options_json`/`config` plumbing is already generic and unaffected by where the frontend sources the values from.
- No D1 schema migration (new keys use the existing generic `config` table).
