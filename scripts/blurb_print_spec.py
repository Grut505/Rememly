"""Print geometry constants for Blurb print-ready cover generation, sourced
from RPI Print's (Blurb's print partner) product-specifications template
generator at https://docs.api.rpiprint.com/products-main (verified against
the live widget on 2026-07-29 for Magazine Premium 8.5x11in and Standard
Portrait 8x10in trim sizes).

All dimensions are stored in inches (the source of truth) with a helper to
convert to centimeters for the rest of the render pipeline, which is
cm-based throughout.
"""

import math

INCH_TO_CM = 2.54

# Trim size (width, height) in inches, portrait orientation, for each
# supported Blurb book format. Cross-checked against blurb.com/book-dimensions.
TRIM_SIZES_IN = {
    "magazine_premium": (8.5, 11.0),
    "standard_portrait": (8.0, 10.0),
}

# Bleed differs by cover type - NOT a single constant. Softcover uses a
# standard 0.125in bleed; Hardcover (ImageWrap) uses 0.75in to allow for the
# wrap around the cover board. Verified identical across both supported
# trim sizes.
BLEED_IN = {
    "softcover": 0.125,
    "hardcover": 0.750,
}

# Hardcover front/back panels grow by this much in each direction relative
# to the nominal trim size, to account for the board (independent of format).
HARDCOVER_BOARD_GROWTH_IN = 0.25

# Minimum distance text/logos must stay from the trim line, for both cover
# types, all formats.
SAFE_ZONE_MARGIN_IN = 0.25

# Barcode reservation area on the back cover: (width, height) in inches, and
# its margin from the trim edge nearest the spine and from the bottom trim
# edge. Approximate - re-measured from RPI's downloadable template PNG since
# the "Detailed Measurements" table's 0.250/0.375 values are the MARGINS
# (spine-side, bottom), not the box's own width/height.
BARCODE_AREA_IN = (2.0, 1.33)
BARCODE_MARGIN_FROM_SPINE_SIDE_IN = 0.25
BARCODE_MARGIN_FROM_BOTTOM_IN = 0.375

# Interior page count bounds shared by both formats.
PAGE_COUNT_MIN = 20
PAGE_COUNT_MAX = 550
PAGE_COUNT_STEP = 2

# Softcover spine width: spineWidthInPoints = floor(ceil((pageCount * 16) / K) * (72 / 16))
# K is paper-type-specific. These 4 paper names and K values are Blurb's own
# real consumer catalog (blurb.fr's "Type de papier" select on the book size
# calculator), NOT the generic RPI Print API docs' fictional-sounding paper
# names ("100# Text, Gloss" etc.) - reverse-engineered by driving the real
# calculator at many page counts and fitting K, then confirmed exact via
# `pdffonts`/pikepdf measurement of a real generated cover. Verified
# identical for both magazine_premium and standard_portrait (Magazine
# Premium only offers "Standard" paper - no paper choice in Blurb's UI - but
# the underlying formula/K is the same one used here). The final floor() to
# a whole point is REQUIRED - without it, spine width comes out ~0.5pt too
# wide for every odd-numbered tier, which is exactly why previously
# generated covers failed Blurb's real dimension check even though they
# looked "close enough".
# "premium-satin" is not independently verified - the public calculator
# only exposes one combined "Premium (mat ou satiné)" option (Blurb's real
# upload tool splits it into "Premium mat"/"Premium satiné"), so it's
# assumed to share premium-matte's K until proven otherwise.
SOFTCOVER_SPINE_DIVISOR_K = {
    "standard": 450,
    "premium-matte": 336,
    "premium-satin": 336,
    "pro-uncoated-paper": 288,
    "pro-medium-gloss-paper": 288,
}

# Hardcover (Blurb calls this "lithowrap"/"Couverture rigide imprimée" -
# image printed directly on the board, matching our single-file cover-wrap
# approach, as opposed to "hardcover"/"Couverture rigide, jaquette" which
# needs a separate dust-jacket file) spine width: a page-count-range lookup
# table carried over unchanged from the generic RPI Print API docs. NOT yet
# re-verified against blurb.fr's real calculator the way softcover was
# (2026-07-31) - only softcover was blocking real uploads so far. Re-keyed
# to the real paper names above; the same table is reused for all 4 papers
# as a placeholder since only the old generic "100# Text, Gloss" table was
# ever measured, and only for Magazine Premium/Standard Portrait Softcover.
_HARDCOVER_SPINE_TABLE_PT_UNVERIFIED = [
    (20, 60, 19.152), (62, 130, 31.896), (132, 200, 44.64), (202, 270, 57.384),
    (272, 340, 70.128), (342, 410, 82.872), (412, 480, 95.76), (482, 550, 108.36),
]
HARDCOVER_SPINE_TABLE_PT = {
    "standard": _HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
    "premium-matte": _HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
    "premium-satin": _HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
    "pro-uncoated-paper": _HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
    "pro-medium-gloss-paper": _HARDCOVER_SPINE_TABLE_PT_UNVERIFIED,
}

POINTS_PER_INCH = 72.0


def inch_to_cm(value_in: float) -> float:
    return value_in * INCH_TO_CM


def softcover_spine_width_in(page_count: int, paper_type: str) -> float:
    # Falls back to "standard" for a paper_type saved before the 2026-07-31
    # rename (e.g. "100# Text, Gloss") rather than raising KeyError - a job
    # can carry an old value from D1 config until Settings is re-saved.
    k = SOFTCOVER_SPINE_DIVISOR_K.get(paper_type, SOFTCOVER_SPINE_DIVISOR_K["standard"])
    n = (page_count * 16 + k - 1) // k
    points = math.floor(n * (72.0 / 16.0))
    return points / POINTS_PER_INCH


def hardcover_spine_width_in(page_count: int, paper_type: str) -> float:
    table = HARDCOVER_SPINE_TABLE_PT.get(paper_type, HARDCOVER_SPINE_TABLE_PT["standard"])
    for lo, hi, points in table:
        if lo <= page_count <= hi:
            return points / POINTS_PER_INCH
    # Page count beyond the table's last tier - caller should already have
    # validated against PAGE_COUNT_MIN/MAX before reaching here.
    return table[-1][2] / POINTS_PER_INCH


def spine_width_in(page_count: int, cover_type: str, paper_type: str) -> float:
    if cover_type == "hardcover":
        return hardcover_spine_width_in(page_count, paper_type)
    return softcover_spine_width_in(page_count, paper_type)


def panel_dimensions_in(format_key: str, cover_type: str) -> tuple:
    """(panel_width, panel_height) in inches - the trim size, grown for the
    board if this is a hardcover."""
    trim_w, trim_h = TRIM_SIZES_IN[format_key]
    growth = HARDCOVER_BOARD_GROWTH_IN if cover_type == "hardcover" else 0.0
    return (trim_w + growth, trim_h + growth)


def full_cover_dimensions_in(format_key: str, cover_type: str, page_count: int, paper_type: str) -> tuple:
    """(full_cover_width, full_cover_height) in inches, including bleed - the
    flat wrap (back panel + spine + front panel side by side)."""
    panel_w, panel_h = panel_dimensions_in(format_key, cover_type)
    spine_w = spine_width_in(page_count, cover_type, paper_type)
    bleed = BLEED_IN[cover_type]
    full_w = 2 * panel_w + spine_w + 2 * bleed
    full_h = panel_h + 2 * bleed
    return (full_w, full_h)
