# Cover preview test photos

200 small, real, royalty-free photos used only by `scripts/render_cover_preview.py`
(the Settings "Preview PDF" button) so the preview shows what the masked-title
front cover and the mosaic back cover actually look like with real image
content, instead of the empty/plain-fallback cover produced with no photos at
all. Never used by the real export path - `render_pdf_chunks.py`'s
`fetch_image_bytes()` is untouched; only the preview script monkeypatches it,
and only for these files.

- Source: [Picsum Photos](https://picsum.photos) (Lorem Picsum), which serves
  real photos from Unsplash under the
  [Unsplash License](https://unsplash.com/license) - free for commercial and
  non-commercial use, no permission or attribution required.
- Downloaded via `https://picsum.photos/id/{n}/{w}/{h}` for `n` in a fixed
  range of Picsum photo IDs, at a handful of small sizes (300-450px on a
  side) mixing portrait/landscape/square so the mosaic layout is exercised
  with realistic aspect-ratio variety - not meant to be print-quality, just
  representative test content.
- Filenames: `test_000.jpg` .. `test_199.jpg`, no other metadata.
