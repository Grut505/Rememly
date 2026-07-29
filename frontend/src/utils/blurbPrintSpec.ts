// Mirrors scripts/blurb_print_spec.py - kept intentionally small and
// duplicated (not shared across the Python/TypeScript boundary) so the
// export UI can show a live spine-width estimate without a render job.
// The Python module remains authoritative for the actual generated PDF;
// if these two ever drift, the render step is the source of truth.

export type BlurbFormat = 'magazine_premium' | 'standard_portrait'
export type BlurbCoverType = 'softcover' | 'hardcover'
export type BlurbPaperType =
  | '100# Text, Gloss'
  | '100# Text, Dull'
  | '100# Text, Eggshell'
  | '70# Text, Uncoated'

export const BLURB_FORMAT_LABELS: Record<BlurbFormat, string> = {
  magazine_premium: 'Magazine Premium (8.5" × 11")',
  standard_portrait: 'Standard Portrait (8" × 10")',
}

export const BLURB_PAPER_TYPES: BlurbPaperType[] = [
  '100# Text, Gloss',
  '100# Text, Dull',
  '100# Text, Eggshell',
  '70# Text, Uncoated',
]

export const PAGE_COUNT_MIN = 20
export const PAGE_COUNT_MAX = 550

const SOFTCOVER_SPINE_DIVISOR_K: Record<BlurbPaperType, number> = {
  '100# Text, Gloss': 400,
  '100# Text, Dull': 360,
  '100# Text, Eggshell': 250,
  '70# Text, Uncoated': 410,
}

const HARDCOVER_SPINE_TABLE_PT: Record<BlurbPaperType, Array<[number, number, number]>> = {
  '100# Text, Gloss': [
    [20, 60, 19.152], [62, 130, 31.896], [132, 200, 44.64], [202, 270, 57.384],
    [272, 340, 70.128], [342, 410, 82.872], [412, 480, 95.76], [482, 550, 108.36],
  ],
  '100# Text, Dull': [
    [20, 54, 19.152], [56, 118, 31.896], [120, 182, 44.64], [184, 246, 57.384],
    [248, 310, 70.128], [312, 374, 82.872], [376, 438, 95.76], [440, 502, 108.36],
  ],
  '100# Text, Eggshell': [
    [20, 38, 19.152], [40, 82, 31.896], [84, 126, 44.64], [128, 170, 57.384],
    [172, 214, 70.128], [216, 258, 82.872], [260, 302, 95.76], [304, 346, 108.36],
  ],
  '70# Text, Uncoated': [
    [24, 60, 19.152], [62, 132, 31.896], [134, 204, 44.64], [206, 276, 57.384],
    [278, 348, 70.128], [350, 420, 82.872], [422, 492, 95.76], [494, 564, 108.36],
  ],
}

const POINTS_PER_INCH = 72

export function softcoverSpineWidthIn(pageCount: number, paperType: BlurbPaperType): number {
  const k = SOFTCOVER_SPINE_DIVISOR_K[paperType]
  const points = Math.ceil((pageCount * 16) / k) * (72 / 16)
  return points / POINTS_PER_INCH
}

export function hardcoverSpineWidthIn(pageCount: number, paperType: BlurbPaperType): number {
  const table = HARDCOVER_SPINE_TABLE_PT[paperType]
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
