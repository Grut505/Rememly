## Why

The PDF export today generates a single whole-album PDF styled for on-screen/A4 viewing - no bleed, no spine, and not sized to any real book product. To let family members order a physical printed copy, they currently have to hand the PDF to a third party and hope it prints correctly, or manually rebuild it in another tool. Blurb (via its RPI Print API) accepts a print-ready cover PDF (front + spine + back, one flat wrap) plus a separate interior "guts" PDF and a product SKU. Making Rememly generate a cover that matches Blurb's exact geometry means a family member can order a printed photo book directly, no manual resizing step in between.

## What Changes

- New global "Blurb mode" setting (persisted in D1, same pattern as `auto_date_from_photo`) that determines whether print-ready cover options appear in the PDF export flow at all. Off by default - the export flow is unchanged unless a user opts in via Settings.
- When Blurb mode is on, the PDF export options step reveals a "print-ready cover" section producing a single flat wrap PDF (front cover + spine + back cover) sized exactly to a chosen Blurb book format, with correct bleed, trim, safe zone, and barcode reservation area baked in.
- User picks, at export time: book format (Magazine Premium, 8.5×11in vs Standard Portrait, 8×10in - both portrait orientation), cover type (Softcover vs Hardcover/ImageWrap), and paper type (drives spine thickness).
- When Blurb mode is on, the interior "guts" pages are also laid out at the chosen format's trim size/aspect ratio (dimensions only - no per-page bleed or safe zone, that precision is reserved for the cover). This keeps interior and cover visually and dimensionally consistent, and gives an authoritative page count to feed the spine calculation.
- Spine width is computed automatically from the *actual generated interior page count* (not a manual estimate) + cover type + paper type, using RPI Print's published formula (Softcover: closed-form formula) or lookup table (Hardcover: page-count-range table).
- Front/back cover artwork reuses the existing cover design (family photo mosaic, title, family name) but re-laid-out to the chosen trim size, with bleed extended and text/logo placement kept inside the safe zone. The cover remains the only fully press-ready element in the strict sense (bleed + safe zone); interior pages are dimensionally compatible but not individually preflighted.
- User can independently pick a background color for the front cover, back cover, and spine (each defaults to white). The color sits behind existing content (e.g. in the margins around the front cover's photo mosaic) rather than replacing it. The back cover's chosen color never applies under the reserved barcode area, which always stays white.
- User can enter custom spine text and choose its font size (spine text is skipped entirely if the computed spine is too narrow to render it legibly).
- User can choose the back cover's style: a solid background color, or a full-cover photo mosaic built from photos in the exported album's date range (reusing the existing mosaic-rendering logic already used for the front cover and month separators), capped by a new persistent "back cover mosaic max photos" setting (-1 = no cap, use every photo).
- If entered spine text won't fit legibly once the actual spine width is known, the user is warned before the cover-wrap PDF is generated, rather than silently losing the text.
- Both supported formats (Magazine Premium and Standard Portrait) ship together in this change - the geometry is format-driven from constants, so there's little added risk in shipping both at once.
- The generated cover-wrap PDF is delivered to the same Google Drive destination as the existing whole-album PDF - no change to today's delivery mechanism.

## Capabilities

### New Capabilities
- `pdf-blurb-print-spec`: canonical print geometry (trim size, bleed, safe zone, barcode area, spine-width formula/table) for each supported Blurb book format × cover type × paper type combination. This is the constants/reference capability everything else reads from.
- `pdf-cover-blurb-export`: the user-facing export flow and render path that produces the actual front+spine+back wrap PDF using the `pdf-blurb-print-spec` geometry for the options the user picked, with spine width derived from the actual generated interior page count.
- `pdf-interior-blurb-layout`: when Blurb mode is enabled, lays out the interior "guts" PDF pages at the selected format's trim size/aspect ratio instead of today's A4-ish layout (dimensions only, not full per-page bleed/preflight).

### Modified Capabilities
(none - this is the first OpenSpec change in this repo, `openspec/specs/` is currently empty)

## Impact

- **Frontend** (`frontend/src/screens/PdfExport/`): new "Blurb mode" toggle in Settings; new selectors for book format, cover type, and paper type in the export flow (likely `PdfGenerateModal.tsx` or a sibling component); spine width shown to the user before export, computed from the interior page count once known (not entered manually).
- **Backend** (`workers/src/routes/pdf.ts`): job creation needs to carry the new options (Blurb mode, format, cover type, paper type) through to the render step; D1 schema likely needs new columns on the PDF job/options table (extends the existing "persist PDF create options in D1" work) and a new global-settings row for Blurb mode.
- **Render pipeline** (`scripts/render_pdf_chunks.py`): currently builds the whole-book cover and interior pages as HTML/CSS at cm-based, A4-ish dimensions. Needs: (1) a new code path building the wrap-cover HTML at exact inch dimensions (trim + bleed) for the chosen format, reusing the existing photo-mosaic/title/family-name rendering logic; (2) when Blurb mode is on, switching the interior page dimensions/aspect ratio to match the chosen format, and reporting the resulting page count back so the cover's spine width can be computed from it. `scripts/render_cover_preview.py` (the GitHub Actions callback wrapper) is likely unaffected structurally.
- **GitHub Actions** (`.github/workflows/pdf-preview.yml`, `pdf-render.yml`): may need new parameters passed through to the render scripts.
- **Out of scope**: Google Apps Script backend (`backend/`) - that's being decommissioned separately and not touched by this change. Full per-page bleed/preflight for interior pages (beyond matching trim/aspect ratio) - not needed for this change, only the cover needs to be strictly press-ready.
