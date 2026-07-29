## Purpose

Provides the canonical print geometry (trim size, bleed, safe zone, barcode reservation, and spine-width calculation) for each Blurb book format, cover type, and paper type Rememly supports, so every other capability reads consistent numbers instead of re-deriving them.

## ADDED Requirements

### Requirement: Supported book formats
The system SHALL define exact trim dimensions, in inches, for at least the "Magazine Premium" (8.5 × 11in, portrait) and "Standard Portrait" (8 × 10in, portrait) Blurb book formats.

#### Scenario: Look up trim size for a format
- **WHEN** a caller requests the trim size for "Magazine Premium"
- **THEN** the system returns width 8.5in and height 11in

### Requirement: Bleed and safe zone
Bleed differs by cover type - it is NOT a single constant across the whole capability. The system SHALL apply a 0.125in bleed on every edge for Softcover, and a 0.750in bleed on every edge for Hardcover (ImageWrap), to allow for the wrap around the cover board. The system SHALL keep text and logo content at least 0.25in inside the trim line (the safe zone) for both cover types. Hardcover front/back panel dimensions SHALL also grow by 0.25in in each direction relative to the nominal trim size, to account for the board.

The full cover is one flat wrap (back panel + spine + front panel side by side), so its overall width is the sum of both panels plus the spine width, not a single panel's width:
- `panelWidth = trimWidth + (coverType == Hardcover ? 0.25in : 0)`
- `panelHeight = trimHeight + (coverType == Hardcover ? 0.25in : 0)`
- `fullCoverWidth = 2 × panelWidth + spineWidth + 2 × bleed`
- `fullCoverHeight = panelHeight + 2 × bleed`

#### Scenario: Full cover dimensions for Softcover
- **WHEN** generating a Softcover cover for the Magazine Premium format (8.5 × 11in trim) with a computed spine width of 0.063in
- **THEN** the produced flat cover canvas is 17.313in wide and 11.250in tall

#### Scenario: Full cover dimensions for Hardcover
- **WHEN** generating a Hardcover cover for the Magazine Premium format (8.5 × 11in trim) with a computed spine width of 0.266in
- **THEN** the produced flat cover canvas is 19.266in wide and 12.750in tall

#### Scenario: Text kept out of the unsafe margin
- **WHEN** placing title or family-name text on the cover, for either cover type
- **THEN** no text glyph is rendered closer than 0.25in to the trim line

### Requirement: Barcode reservation area
For Softcover and Hardcover formats, the system SHALL reserve a barcode area on the back cover approximately 2in wide × 1.33in tall (exact size to be confirmed against RPI Print's downloadable template before implementation), positioned with a 0.25in margin from the trim edge nearest the spine and a 0.375in margin from the bottom trim edge. No photo or text content SHALL be placed inside this reserved area, and it SHALL always render on a plain white background regardless of the back cover's chosen background color, to preserve barcode scannability.

#### Scenario: Barcode area kept clear of content
- **WHEN** rendering the back cover
- **THEN** no photo or text content is placed inside the reserved barcode area

#### Scenario: Barcode area stays white regardless of back cover color
- **WHEN** the user has chosen a dark or colored background for the back cover
- **THEN** the reserved barcode area still renders on a plain white background

### Requirement: Spine width calculation
The system SHALL compute spine width from page count, cover type, and paper type:
- For Softcover, using the closed-form formula: `spineWidthInPoints = ceil((pageCount × 16) / 400) × (72 / 16)`.
- For Hardcover (ImageWrap), using the page-count-range lookup table published by RPI Print (e.g. 20-60 pages → 0.266in, 62-130 → 0.443in, 132-200 → 0.62in, etc.).

#### Scenario: Softcover spine width for a given page count
- **WHEN** page count is 100 and cover type is Softcover
- **THEN** computed spine width is 18pt (0.25in)

#### Scenario: Hardcover spine width falls in a page-count range
- **WHEN** page count is 150 and cover type is Hardcover
- **THEN** computed spine width is the value for the 132-200 range (0.62in)

### Requirement: Page count bounds
The system SHALL define the supported interior page count range as 20 to 550 inclusive, in multiples of 2, matching RPI Print's supported range. This requirement only defines the range as a reference constant - what happens when generated content falls outside it, or lands on an odd count, is defined by the capabilities that produce and consume page counts (`pdf-interior-blurb-layout` pads odd counts; `pdf-cover-blurb-export` blocks only the cover when the count is out of range).

#### Scenario: Range lookup
- **WHEN** a caller asks for the supported page count range
- **THEN** the system returns 20 as the minimum and 550 as the maximum, both inclusive, with a step of 2
