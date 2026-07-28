# PDF cover fonts

Free, metric/style-compatible substitutes for the fonts referenced by the PDF
cover generator (`scripts/render_pdf_chunks.py`), bundled here so the
GitHub Actions render runner doesn't fall back to a generic serif with
different glyph metrics (which was causing visible gaps in the masked-title
cover's vertical text).

- `EBGaramond-Regular.ttf` — EB Garamond (variable weight), OFL license.
  Source: https://github.com/google/fonts/tree/main/ofl/ebgaramond
- `TeXGyrePagella-Regular.otf` / `TeXGyrePagella-Bold.otf` — TeX Gyre Pagella,
  a metric-compatible Palatino clone, GUST Font License (free/open).
  Source: https://ctan.org/pkg/tex-gyre
- `GFSDidot-Regular.ttf` — GFS Didot, OFL license.
  Source: https://github.com/google/fonts/tree/main/ofl/gfsdidot
