// Mirrors scripts/blurb_print_spec.py - kept intentionally small and
// duplicated (not shared across the Python/TypeScript boundary) so the
// export UI can show a live spine-width estimate without a render job.
// The Python module remains authoritative for the actual generated PDF;
// if these two ever drift, the render step is the source of truth.

export type BlurbFormat = 'magazine_premium' | 'standard_portrait'
export type BlurbCoverType = 'softcover' | 'hardcover'
export type BlurbPaperType =
  | 'standard'
  | 'premium-matte'
  | 'premium-satin'
  | 'pro-uncoated-paper'
  | 'pro-medium-gloss-paper'

export const BLURB_FORMAT_LABELS: Record<BlurbFormat, string> = {
  magazine_premium: 'Magazine Premium (8.5" × 11")',
  standard_portrait: 'Standard Portrait (8" × 10")',
}

// Blurb's own real paper catalog, keyed/labeled to match blurb.fr's real
// upload tool's "Type de papier" select exactly (5 entries there - not the
// public booksize_calculator, which combines mat/satin into one option) so
// the label the user picks here is the same wording they see on Blurb's
// own site. Magazine Premium only ever offers "standard" in Blurb's own UI
// (no paper choice), but the formula/K is the same for both formats.
export const BLURB_PAPER_TYPES: BlurbPaperType[] = [
  'standard',
  'premium-matte',
  'premium-satin',
  'pro-uncoated-paper',
  'pro-medium-gloss-paper',
]

export const BLURB_PAPER_LABELS: Record<BlurbPaperType, string> = {
  standard: 'Standard',
  'premium-matte': 'Premium mat',
  'premium-satin': 'Premium satiné',
  'pro-uncoated-paper': 'Mohawk Superfine finition en coquille d’œuf',
  'pro-medium-gloss-paper': 'Mohawk proPhoto perle',
}

export const PAGE_COUNT_MIN = 20
export const PAGE_COUNT_MAX = 550
export const PAGE_COUNT_STEP = 2

// Trim size (width, height) in inches - mirrors scripts/blurb_print_spec.py's
// TRIM_SIZES_IN. The spine's usable LENGTH (its "height" once the text is
// rotated -90deg to run along it) is this trim height, grown by the board
// for hardcover - not the spine WIDTH (thickness), which is what
// spineWidthIn() above computes.
const TRIM_SIZES_IN: Record<BlurbFormat, [number, number]> = {
  magazine_premium: [8.5, 11.0],
  standard_portrait: [8.0, 10.0],
}
const HARDCOVER_BOARD_GROWTH_IN = 0.25

export function panelHeightIn(format: BlurbFormat, coverType: BlurbCoverType): number {
  const [, trimH] = TRIM_SIZES_IN[format]
  return coverType === 'hardcover' ? trimH + HARDCOVER_BOARD_GROWTH_IN : trimH
}

// K values reverse-engineered from blurb.fr's real calculator (many page
// counts sampled per paper, fit exactly - see scripts/blurb_print_spec.py
// for the full methodology note). Confirmed identical for both
// magazine_premium and standard_portrait. "premium-satin" is not
// independently verified - the public calculator only exposes one combined
// "Premium (mat ou satiné)" option, so it's assumed to share premium-matte's
// K until proven otherwise.
const SOFTCOVER_SPINE_DIVISOR_K: Record<BlurbPaperType, number> = {
  standard: 450,
  'premium-matte': 336,
  'premium-satin': 336,
  'pro-uncoated-paper': 288,
  'pro-medium-gloss-paper': 288,
}

// Hardcover ("lithowrap"/"Couverture rigide imprimée" in Blurb's UI) spine
// table - NOT yet re-verified against the real calculator the way softcover
// was (2026-07-31); carried over unchanged from the old generic RPI docs
// table and reused for all 5 real paper names as a placeholder.
const HARDCOVER_SPINE_TABLE_PT_UNVERIFIED: Array<[number, number, number]> = [
  [20, 60, 19.152], [62, 130, 31.896], [132, 200, 44.64], [202, 270, 57.384],
  [272, 340, 70.128], [342, 410, 82.872], [412, 480, 95.76], [482, 550, 108.36],
]
const HARDCOVER_SPINE_TABLE_PT: Record<BlurbPaperType, Array<[number, number, number]>> = {
  standard: HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
  'premium-matte': HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
  'premium-satin': HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
  'pro-uncoated-paper': HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
  'pro-medium-gloss-paper': HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
}

const POINTS_PER_INCH = 72

export function softcoverSpineWidthIn(pageCount: number, paperType: BlurbPaperType): number {
  // Falls back to "standard" for a paperType saved before the 2026-07-31
  // rename (e.g. "100# Text, Gloss") rather than computing NaN - Settings
  // can carry an old value from D1 config until it's re-saved.
  const k = SOFTCOVER_SPINE_DIVISOR_K[paperType] ?? SOFTCOVER_SPINE_DIVISOR_K.standard
  const n = Math.ceil((pageCount * 16) / k)
  const points = Math.floor(n * (72 / 16))
  return points / POINTS_PER_INCH
}

export function hardcoverSpineWidthIn(pageCount: number, paperType: BlurbPaperType): number {
  const table = HARDCOVER_SPINE_TABLE_PT[paperType] ?? HARDCOVER_SPINE_TABLE_PT.standard
  for (const [lo, hi, points] of table) {
    if (pageCount >= lo && pageCount <= hi) return points / POINTS_PER_INCH
  }
  return table[table.length - 1][2] / POINTS_PER_INCH
}

export function spineWidthIn(pageCount: number, coverType: BlurbCoverType, paperType: BlurbPaperType): number {
  return coverType === 'hardcover' ? hardcoverSpineWidthIn(pageCount, paperType) : softcoverSpineWidthIn(pageCount, paperType)
}

// Mirrors render_pdf_chunks.py's `1 + ceil(len(month_articles) / 2)` summed
// across months, then padded to the next even number - the same rule the
// render script applies. This is an ESTIMATE for live UI feedback only; the
// actual render is the source of truth for the real page count.
export function estimateInteriorPageCount(monthActiveCounts: number[]): number {
  const total = monthActiveCounts.reduce((sum, count) => sum + 1 + Math.ceil(count / 2), 0)
  return total % 2 === 1 ? total + 1 : total
}

export function formatSpineWidth(widthIn: number, units: 'inches' | 'centimeters'): string {
  if (units === 'centimeters') {
    return `${(widthIn * 2.54).toFixed(2)} cm`
  }
  return `${widthIn.toFixed(3)} in`
}

export const CM_PER_INCH = 2.54

export function cmToIn(cm: number): number {
  return cm / CM_PER_INCH
}

export function inToCm(inches: number): number {
  return inches * CM_PER_INCH
}

export const SPINE_FONT_SIZE_MIN_CM = 0.05
export const SPINE_FONT_SIZE_MAX_CM = 2.5

// A recommended font size that comfortably fits within the spine at a given
// width - leaves margin (30%) rather than using the full spine width, which
// would print edge-to-edge with no breathing room. This is a hint only; the
// render script's own fit check (spine width >= font size) is authoritative
// for whether text actually renders or gets dropped.
export function recommendedSpineFontSizeCm(spineWidthInches: number): number {
  const spineWidthCm = spineWidthInches * 2.54
  const raw = spineWidthCm * 0.7
  const clamped = Math.min(SPINE_FONT_SIZE_MAX_CM, Math.max(SPINE_FONT_SIZE_MIN_CM, raw))
  return Math.round(clamped / 0.05) * 0.05
}

// Rough average character width for the spine's serif font stack ('Palatino
// Linotype' etc.) - not exact per-glyph metrics (no real text measurement
// happens at Settings/export-config time, only at the actual Playwright
// render), but good enough to warn before generating rather than silently
// clipping. render_pdf_chunks.py uses the same constant so the frontend's
// warning and the real render's fit check agree.
export const SPINE_TEXT_AVG_CHAR_WIDTH_EM = 0.5

// Small bottom margin the spine text div is offset by in render_pdf_chunks.py
// (bottom:0.3cm) - subtracted from the available length so the estimate
// matches the real render's usable space.
export const SPINE_TEXT_BOTTOM_MARGIN_CM = 0.3

export function estimateSpineTextLengthCm(text: string, fontSizeCm: number): number {
  return text.length * fontSizeCm * SPINE_TEXT_AVG_CHAR_WIDTH_EM
}

// Distinct from spineWidthIn()'s width (thickness) check - this checks
// whether the text's estimated rendered LENGTH fits within the spine's
// available length (the panel's trim height, minus the render script's
// small bottom margin) before it gets clipped by the spine panel's
// overflow:hidden.
export function spineTextFitsHeight(
  text: string, fontSizeCm: number, format: BlurbFormat, coverType: BlurbCoverType
): boolean {
  if (!text.trim()) return true
  const availableLengthCm = inToCm(panelHeightIn(format, coverType)) - SPINE_TEXT_BOTTOM_MARGIN_CM
  return estimateSpineTextLengthCm(text, fontSizeCm) <= availableLengthCm
}
