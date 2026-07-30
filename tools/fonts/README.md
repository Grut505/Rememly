# PDF cover fonts

Free, metric/style-compatible substitutes for the fonts referenced by the PDF
cover generator (`scripts/render_pdf_chunks.py`), bundled here so the
GitHub Actions render runner doesn't fall back to a generic serif with
different glyph metrics (which was causing visible gaps in the masked-title
cover's vertical text).

- `EBGaramond-Regular.ttf` — EB Garamond (variable weight), OFL license.
  Source: https://github.com/google/fonts/tree/main/ofl/ebgaramond
  Kept as source material only - `_font_face_css()` no longer references
  this file directly (see `EBGaramond-*-Static.ttf` below).
- `TeXGyrePagella-Regular.otf` / `TeXGyrePagella-Bold.otf` — TeX Gyre Pagella,
  a metric-compatible Palatino clone, GUST Font License (free/open).
  Source: https://ctan.org/pkg/tex-gyre
  Kept as source material only - `_font_face_css()` uses the converted
  `-TTF.ttf` versions below.
- `GFSDidot-Regular.ttf` — GFS Didot, OFL license.
  Source: https://github.com/google/fonts/tree/main/ofl/gfsdidot

## Derived static files (actually used by `_font_face_css()`)

Chromium's print-to-PDF pipeline embeds both **variable fonts** and some
**CFF/OpenType (.otf)** fonts as Type 3 (rasterized glyph procedures, not a
real font program) - Blurb's own PDF validator rejects Type 3 as "no
embedded font found", even though tools like `pdffonts` consider it
"embedded". Confirmed via isolated Playwright + `pdffonts` tests (see
`openspec` history / project memory for the investigation).

- `EBGaramond-{400,500,600,700,800}-Static.ttf` — static instances of
  `EBGaramond-Regular.ttf`'s `wght` axis, one per weight offered in
  Settings (matching the font's own named instances: Regular/Medium/
  SemiBold/Bold/ExtraBold). Generated with:
  ```
  python -c "
  from fontTools.varLib import instancer
  from fontTools.ttLib import TTFont
  font = TTFont('EBGaramond-Regular.ttf')
  instancer.instantiateVariableFont(font, {'wght': <weight>}, inplace=True)
  font.save('EBGaramond-<weight>-Static.ttf')
  "
  ```
- `TeXGyrePagella-Regular-TTF.ttf` / `TeXGyrePagella-Bold-TTF.ttf` — the
  `.otf` (CFF) originals converted to TrueType (glyf) outlines via
  `otf2ttf`/`cu2qu` (cubic → quadratic Bézier conversion):
  ```
  from otf2ttf.cli import otf_to_ttf
  from fontTools.ttLib import TTFont
  font = TTFont('TeXGyrePagella-Regular.otf')
  otf_to_ttf(font)
  font.save('TeXGyrePagella-Regular-TTF.ttf')
  ```
  Verified visually identical to the original (screenshot comparison) and
  confirmed via `pdffonts` to embed as proper CID TrueType instead of Type 3.
- `GFSDidot-Regular.ttf` needed no conversion - it's already a static TTF
  and was already embedding correctly.
