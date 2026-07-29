## Context

The current PDF pipeline (see `scripts/render_pdf_chunks.py`, orchestrated by `workers/src/routes/pdf.ts` and GitHub Actions) works like this: a job's articles are grouped by month; a GitHub Action renders one HTML "chunk" per month plus a single cover chunk via Playwright (`render_html_to_pdf`), uploads each chunk PDF to a temp Drive folder, and reports progress back to the Worker. A separate merge step (`scripts/merge_pdf_from_drive.py` / `pdf-merge.yml`) concatenates the chunks into the final PDF and moves it (`driveMoveFile`) into the family's Drive folder - this is the "no change to today's delivery mechanism" referenced in the proposal.

Page geometry today is a single hardcoded CSS constant: `@page { size: A4; margin: 1cm; }` in `PAGE_CSS`, with matching hardcoded `27.7cm`/`19cm` height/width values scattered through the cover and article page CSS. Cover content (mosaic or masked-title style) is built by `generate_cover_mosaic` / `generate_cover_masked_mosaic`, both parametrized by width/height/photo-list already - they aren't A4-specific, just called with A4-shaped arguments today.

Two tables already provide the storage this change needs with zero migration: `options_json` (a free-form JSON blob already on `pdf_jobs` and `pdf_previews`, already carrying `cover_style` etc.) and the generic `config` key-value table (already storing `auto_date_from_photo` and similar global preferences).

See proposal.md for the full "why" and "what changes" - this document covers how.

## Goals / Non-Goals

**Goals:**
- Reuse existing mosaic/rendering primitives (`smart_mosaic_layout`, `generate_cover_mosaic`, `generate_cover_masked_mosaic`, `render_html_to_pdf`) rather than building a parallel rendering path.
- Keep all new storage on existing generic tables (`options_json`, `config`) - no schema migration.
- Make the interior page-size change a pure parametrization of existing CSS/constants, not a fork of the templates.

**Non-Goals:**
- Full per-page bleed/preflight for interior pages (per proposal - dimensions/aspect ratio only).
- Any RPI Print API order-submission integration (file generation only, per the scoping discussion).
- Sharing the page-count formula between Python and TypeScript via a common library - a small, well-commented duplication is accepted (see Risks).

## Decisions

**Constants module for `pdf-blurb-print-spec`.** Add a new `scripts/blurb_print_spec.py` (or a clearly-delimited constants block in `render_pdf_chunks.py`) holding trim sizes, bleed-by-cover-type, the barcode geometry, and the spine formula/table, converted to centimeters once at load time from the authoritative inch values (RPI Print's published numbers). Alternative considered: work in inches throughout the render pipeline - rejected, the rest of the file (mosaic layout, existing page constants) is thoroughly cm-based, and mixing units invites conversion bugs.

**Cover-wrap generation reuses existing mosaic functions.** The front panel calls the same `generate_cover_mosaic` / `generate_cover_masked_mosaic` functions used today, just with the wrap's panel width/height instead of A4's. The back panel's mosaic style reuses `smart_mosaic_layout` directly with the full-album photo list. A new `generate_blurb_cover_html(...)` function assembles back-panel + spine + front-panel into one flat HTML canvas sized per the `pdf-blurb-print-spec` formulas (`fullCoverWidth`/`fullCoverHeight`), with its own `@page` CSS block, and renders through the same `render_html_to_pdf` Playwright helper already used for every other chunk. Alternative considered: a separate mosaic implementation for the print cover - rejected as needless duplication risking divergent bugs between the two mosaic code paths.

**Interior page size is parametrized, not forked.** `PAGE_CSS`'s hardcoded `@page` size and the hardcoded height/width constants become generated from the selected format's trim dimensions when Blurb mode is on, and default to today's A4 constants when it's off. Alternative considered: maintain two separate template sets (A4 vs Blurb) - rejected, the layout algorithm itself doesn't change, only the dimensions, so a single parametrized template is more maintainable.

**Page count is derivable before rendering, not after.** `page_counts[key] = 1 + ceil(len(month_articles)/2)` is already a pure function of article counts, independent of physical page size - so the total interior page count is known as soon as articles are fetched, before any HTML actually renders. This means spine width can be computed immediately rather than waiting for interior rendering to finish. This doesn't change the specs' observable behavior (the user still sees the interior PDF delivered and the spine width shown before the cover-wrap is produced); it just means the implementation can compute spine width earlier than a literal reading of "after the interior pages have been generated" might suggest.

**Odd-page padding.** When the computed total (at the chosen format) is odd, append one small blank-page HTML chunk after the last month chunk before merging, uploaded and merged like any other chunk - no special-casing needed in the merge script, which just concatenates in order.

**Frontend live spine-width preview.** The Worker exposes the same deterministic page-count formula (mirrored in TypeScript) used by the existing month-count/preview step, so the export UI can show a live spine-width estimate as the user changes format/cover type/paper type, without running a full render job. The Python script's formula remains authoritative for the actual render. This is an intentional, small, well-commented duplication (see Risks) rather than sharing code across the Python/TypeScript boundary for a single trivial formula.

**Cover-wrap delivery reuses the existing move-to-Drive step.** `merge_pdf_from_drive.py` (already responsible for moving the finished merged album PDF via `driveMoveFile`) is extended to also move the separately-generated `cover_wrap.pdf` chunk into the same destination folder, under a distinct filename (e.g. `<job-name>-cover-blurb.pdf`). No new merge logic is needed since the cover-wrap is already a single complete PDF, not a set of chunks to concatenate.

**Storage: existing generic tables only.** Blurb mode, measurement-unit preference, and back-cover-mosaic-max-photos are new keys in the existing `config` key-value table (same pattern as `auto_date_from_photo`). Per-export choices (format, cover type, paper type, per-zone colors, spine text/font size, back-cover style) are new keys in the existing `options_json` blob already present on `pdf_jobs`/`pdf_previews`. No schema migration.

## Risks / Trade-offs

- [Risk] Only the Magazine Premium (8.5×11in) geometry was numerically verified end-to-end against RPI Print's live template generator; Standard Portrait (8×10in) and the non-default paper types' hardcover spine tables weren't individually re-verified → Mitigation: pull the remaining format/paper-type combinations from RPI's template generator the same way before hardcoding them, and keep all constants in one well-commented module citing the source.
- [Risk] Page-count formula duplicated between the Worker's TypeScript (live estimate) and the Python render script (actual) could silently drift apart → Mitigation: keep the formula trivial and cross-reference both implementations in comments; not worth a shared-library abstraction for one arithmetic line.
- [Risk] An uncapped ("-1") back-cover mosaic on a large album (hundreds of photos) could slow down or bloat the Playwright render step → Mitigation: the new "back cover mosaic max photos" setting exists specifically to bound this; default it to a sane positive number rather than -1.
- [Risk] The masked-title front cover's SVG text-mask approach was tuned for today's A4-ish aspect ratio; applying it at Magazine Premium/Standard Portrait proportions may need scale-factor tweaks → Mitigation: the existing scale-factor options (`cover_family_scale_x/y`, etc.) already exist for this kind of tuning; flag for visual QA during implementation rather than assuming it transfers perfectly.
- [Risk] Adding cover-wrap generation (and a potentially large back-cover mosaic) increases GitHub Actions job runtime → Mitigation: the cover-wrap is a single lightweight render (roughly one page's worth of work), unlikely to meaningfully change the existing runtime budget; watched via the existing progress-reporting mechanism.

## Migration Plan

No database schema migration is required - both storage locations (`options_json`, `config`) already exist and accept new keys freely.

Suggested rollout order:
1. Ship the `pdf-blurb-print-spec` constants module and the interior page-size parametrization, gated behind Blurb mode defaulting OFF - no behavior change for any existing user until enabled.
2. Ship cover-wrap generation and the new export-flow UI (format/cover-type/paper-type/colors/spine text/back-cover style selectors).
3. Enable the "Blurb mode" Settings toggle last, once a real end-to-end test (generate a Blurb-mode PDF + cover for a real date range and inspect the resulting files with a PDF measurement tool) confirms dimensions/bleed match the RPI constants.

Rollback: Blurb mode is opt-in and off by default - disabling/hiding the Settings toggle instantly reverts to today's behavior, no data to unwind.

## Open Questions

- Exact numeric confirmation of Standard Portrait (8×10in) bleed/safe-zone/spine-table values, and the hardcover spine tables for the three non-default paper types - deferrable data-gathering (same method used for Magazine Premium), doesn't change the approach.
- Final default value for "back cover mosaic max photos" (a sane positive number, e.g. somewhere in the 100-300 range) - tune during implementation/QA rather than guessing now.
