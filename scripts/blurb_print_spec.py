"""Print geometry constants for Blurb print-ready cover generation, sourced
from RPI Print's (Blurb's print partner) product-specifications template
generator at https://docs.api.rpiprint.com/products-main (verified against
the live widget on 2026-07-29 for Magazine Premium 8.5x11in and Standard
Portrait 8x10in trim sizes).

All dimensions are stored in inches (the source of truth) with a helper to
convert to centimeters for the rest of the render pipeline, which is
cm-based throughout.
"""

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

# Softcover spine width: spineWidthInPoints = ceil((pageCount * 16) / K) * (72 / 16)
# K is paper-type-specific - it is NOT a universal constant. Verified by
# switching paper type on RPI's widget and reading the displayed formula.
SOFTCOVER_SPINE_DIVISOR_K = {
    "100# Text, Gloss": 400,
    "100# Text, Dull": 360,
    "100# Text, Eggshell": 250,
    "70# Text, Uncoated": 410,
}

# Hardcover spine width: a page-count-range lookup table. The spine-width
# tiers themselves (in points) are identical across paper types; only the
# page-count range boundaries shift, since thinner paper fits more pages
# into the same physical thickness tier. Each entry: (min_pages, max_pages, spine_width_pt).
HARDCOVER_SPINE_TABLE_PT = {
    "100# Text, Gloss": [
        (20, 60, 19.152), (62, 130, 31.896), (132, 200, 44.64), (202, 270, 57.384),
        (272, 340, 70.128), (342, 410, 82.872), (412, 480, 95.76), (482, 550, 108.36),
    ],
    "100# Text, Dull": [
        (20, 54, 19.152), (56, 118, 31.896), (120, 182, 44.64), (184, 246, 57.384),
        (248, 310, 70.128), (312, 374, 82.872), (376, 438, 95.76), (440, 502, 108.36),
    ],
    "100# Text, Eggshell": [
        (20, 38, 19.152), (40, 82, 31.896), (84, 126, 44.64), (128, 170, 57.384),
        (172, 214, 70.128), (216, 258, 82.872), (260, 302, 95.76), (304, 346, 108.36),
    ],
    "70# Text, Uncoated": [
        (24, 60, 19.152), (62, 132, 31.896), (134, 204, 44.64), (206, 276, 57.384),
        (278, 348, 70.128), (350, 420, 82.872), (422, 492, 95.76), (494, 564, 108.36),
    ],
}

POINTS_PER_INCH = 72.0


def inch_to_cm(value_in: float) -> float:
    return value_in * INCH_TO_CM


def softcover_spine_width_in(page_count: int, paper_type: str) -> float:
    k = SOFTCOVER_SPINE_DIVISOR_K[paper_type]
    points = ((page_count * 16 + k - 1) // k) * (72.0 / 16.0)
    return points / POINTS_PER_INCH


def hardcover_spine_width_in(page_count: int, paper_type: str) -> float:
    table = HARDCOVER_SPINE_TABLE_PT[paper_type]
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
