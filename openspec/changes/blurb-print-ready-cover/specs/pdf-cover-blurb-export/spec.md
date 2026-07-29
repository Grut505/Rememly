## Purpose

Lets a family member generate a single print-ready cover PDF (front + spine + back, one flat wrap) sized for a chosen Blurb book format directly from the existing PDF export flow, so it can be submitted to Blurb for physical printing without manual resizing.

## ADDED Requirements

### Requirement: Global Blurb mode setting
The system SHALL provide a persistent "Blurb mode" setting, stored in D1 following the same pattern as other global preferences (e.g. `auto_date_from_photo`), that determines whether print-ready cover options are offered during PDF export. The setting SHALL persist across sessions until changed by the user.

#### Scenario: Blurb mode enabled from Settings
- **WHEN** a user enables "Blurb mode" in Settings
- **THEN** the preference is persisted in D1 and remains enabled the next time the user opens the app

#### Scenario: Blurb mode off by default
- **WHEN** Blurb mode has never been configured
- **THEN** the PDF export options step does not show any print-ready cover selectors

### Requirement: Measurement unit preference
The system SHALL provide a persistent "measurement units" setting (Inches or Centimeters), stored the same way as other global preferences, controlling how Blurb-related dimensions (trim size, bleed, spine width) are displayed to the user. All underlying geometry and calculations SHALL remain based on the authoritative inch-based RPI Print values regardless of display unit; when displayed in centimeters, values SHALL be clearly shown as rounded, and the rounded centimeter value SHALL NOT be used as the source of truth for any calculation.

#### Scenario: Switching to centimeters rounds displayed values
- **WHEN** the user sets measurement units to Centimeters
- **THEN** spine width, trim size, and bleed are displayed converted to centimeters, rounded for readability

#### Scenario: Calculations stay inch-based regardless of display unit
- **WHEN** the user switches between Inches and Centimeters
- **THEN** the computed spine width and cover dimensions used for the actual generated PDF do not change - only the displayed unit changes

### Requirement: Print-ready cover options shown when Blurb mode is enabled
When the global Blurb mode setting is enabled, the PDF export options step SHALL reveal selectors for book format (Magazine Premium, Standard Portrait), cover type (Softcover, Hardcover/ImageWrap), and paper type. Interior page count is NOT a user-entered field - it is derived automatically from the generated interior content (see `pdf-interior-blurb-layout`). When Blurb mode is disabled, these selectors SHALL NOT appear and the export flow SHALL behave exactly as it does today.

#### Scenario: Selectors appear when Blurb mode is on
- **WHEN** Blurb mode is enabled in Settings and the user opens the PDF export options step
- **THEN** format, cover type, and paper type selectors are visible, with no page count field to fill in

#### Scenario: Selectors hidden when Blurb mode is off
- **WHEN** Blurb mode is disabled in Settings and the user opens the PDF export options step
- **THEN** no print-ready cover selectors are shown and the export flow matches today's behavior

### Requirement: Spine width feedback after interior generation
The system SHALL compute the spine width from the actual interior page count once the interior pages have been generated at the selected format, and SHALL display it to the user before the cover-wrap PDF is produced.

#### Scenario: Spine width shown after page count is known
- **WHEN** the interior pages finish generating at the selected format and the resulting page count is known
- **THEN** the system displays the computed spine width for that page count, cover type, and paper type before generating the cover-wrap PDF

#### Scenario: Spine width recalculates if cover type or paper type changes
- **WHEN** the user changes cover type or paper type after the interior page count is already known
- **THEN** the displayed spine width recalculates immediately using the existing page count, without regenerating the interior

#### Scenario: Changing format requires regenerating the interior
- **WHEN** the user changes book format after the interior page count is already known
- **THEN** the interior pages are regenerated at the new format's aspect ratio (per `pdf-interior-blurb-layout`), producing a new page count, and the spine width is recomputed from that new count once available

### Requirement: Per-zone background colors
The print-ready cover export options SHALL let the user independently choose a background color for the front cover, back cover, and spine. Each SHALL default to white. The chosen color for a zone SHALL render as the backdrop behind that zone's existing content (e.g. visible in the margins/gaps around the front cover's photo mosaic) and SHALL NOT replace or hide that content. The back cover's chosen color SHALL NOT apply to the reserved barcode area, which always stays white (see `pdf-blurb-print-spec`).

#### Scenario: Independent colors per zone
- **WHEN** the user sets a red background for the spine and a blue background for the back cover
- **THEN** the generated cover shows red behind the spine content and blue behind the back cover content, independently of each other

#### Scenario: Defaults to white
- **WHEN** no background color has been chosen for a zone
- **THEN** that zone renders with a white background

#### Scenario: Background color sits behind existing content
- **WHEN** a background color is set for the front cover, which already displays the photo mosaic
- **THEN** the chosen color appears only in the margins/gaps around the mosaic photos, not over them

### Requirement: Configurable spine text
The print-ready cover export options SHALL let the user enter custom spine text and choose its font size, independently of the front cover's title/subtitle configuration. Once the interior page count is known and the spine width is computed, if the spine is too narrow for the entered text to render legibly, the system SHALL warn the user before generating the cover-wrap PDF, rather than silently dropping the text. If the user proceeds anyway, the spine text SHALL be omitted and the spine SHALL render as color-only.

#### Scenario: Custom spine text rendered
- **WHEN** the user enters spine text and a font size, and the computed spine width is wide enough for it to render legibly
- **THEN** the cover-wrap PDF renders that text on the spine at the chosen size

#### Scenario: User warned before generation when text won't fit
- **WHEN** the computed spine width is too narrow for the entered text to render legibly at any reasonable size
- **THEN** the system warns the user before generating the cover-wrap PDF, explaining that the spine text will not appear

#### Scenario: Spine renders color-only after the warning is acknowledged
- **WHEN** the user proceeds with generation after being warned that spine text won't fit
- **THEN** the spine text is omitted entirely and the spine renders as color only

### Requirement: Back cover style choice
The print-ready cover export options SHALL let the user choose the back cover's style: either a solid background color (as defined by Per-zone background colors) or a full-cover photo mosaic composed of every photo included in the exported album's date range. When the mosaic style is selected, the chosen back-cover background color SHALL still apply as backdrop behind the mosaic's gaps, consistent with how the front cover mosaic already behaves. Either style SHALL respect the safe zone and the reserved barcode area.

#### Scenario: Solid color back cover
- **WHEN** the user selects the solid-color style for the back cover
- **THEN** the back cover renders as the chosen background color with no photos, aside from the reserved barcode area

#### Scenario: Full-album mosaic back cover
- **WHEN** the user selects the mosaic style for the back cover
- **THEN** the back cover renders a photo grid using photos from the exported album's date range, up to the configured maximum, sized to fill the back cover panel while respecting the safe zone and the reserved barcode area

### Requirement: Back cover mosaic photo cap
The system SHALL provide a persistent "back cover mosaic max photos" setting, stored the same way as other global preferences. A value of -1 SHALL mean no cap (use every photo in the exported album's date range); any positive value SHALL cap the mosaic to that many photos.

#### Scenario: Capped mosaic
- **WHEN** the back cover mosaic max photos setting is a positive number N and the album's date range contains more than N photos
- **THEN** the back cover mosaic uses at most N photos

#### Scenario: Uncapped mosaic
- **WHEN** the back cover mosaic max photos setting is -1
- **THEN** the back cover mosaic uses every photo in the exported album's date range, regardless of count

### Requirement: Front cover artwork reuses the digital PDF's cover configuration
The print-ready cover's FRONT cover SHALL reuse the same cover style, photo mosaic, title, and family name already configured for the digital PDF's cover page, re-laid-out to the selected format's trim size and bleed. It SHALL NOT require the user to reconfigure the front cover content separately. The back cover and spine are new surfaces with no digital-PDF equivalent, and are configured independently (see Back cover style choice, Configurable spine text, Per-zone background colors).

#### Scenario: Same photos and title appear on the print cover
- **WHEN** a print-ready cover is generated after the digital PDF's cover has been configured with a specific mosaic layout and title
- **THEN** the print-ready cover displays the same photos and title, positioned within the new format's safe zone

### Requirement: Separate cover PDF output
Generating a print-ready cover SHALL produce a distinct downloadable cover-wrap PDF file, in addition to the interior/whole-album PDF - the two are always delivered as separate files, never merged into one. When Blurb mode is on, the interior/whole-album PDF is itself laid out at the chosen format's dimensions (per `pdf-interior-blurb-layout`); this requirement only guarantees the cover is a separate file, not that the interior is untouched.

#### Scenario: Both files available after generation
- **WHEN** the user generates a PDF with Blurb mode enabled
- **THEN** both the interior/whole-album PDF (laid out at the chosen format) and the new cover-wrap PDF are available for download afterward, as two separate files

### Requirement: Cover PDF delivered to the same Drive destination
The generated print-ready cover PDF SHALL be delivered to the same Google Drive destination as the existing whole-album PDF, using the existing delivery mechanism (files continue to land in Drive, unchanged from today).

#### Scenario: Cover PDF lands in Drive alongside the album PDF
- **WHEN** a print-ready cover is generated
- **THEN** the resulting cover-wrap PDF file is moved into the same Google Drive folder as the whole-album PDF

### Requirement: Out-of-range page count blocks only the cover
If the actual generated interior page count falls outside RPI Print's supported range (20-550, multiples of 2 - see `pdf-blurb-print-spec`), the system SHALL still generate and deliver the interior/whole-album PDF normally, and SHALL skip cover-wrap generation with a validation message explaining why (e.g. "not enough pages for Blurb's minimum" or "too many pages for this format").

#### Scenario: Too few pages blocks only the cover
- **WHEN** Blurb mode is enabled and the generated interior has fewer than 20 pages
- **THEN** the interior/whole-album PDF still generates and delivers, and the user sees a validation error explaining the cover-wrap PDF was not produced

#### Scenario: Too many pages blocks only the cover
- **WHEN** Blurb mode is enabled and the generated interior has more than 550 pages
- **THEN** the interior/whole-album PDF still generates and delivers, and the user sees a validation error explaining the cover-wrap PDF was not produced
