## MODIFIED Requirements

### Requirement: Global Blurb mode setting
The system SHALL provide a persistent "Blurb mode" setting, stored in D1 following the same pattern as other global preferences (e.g. `auto_date_from_photo`), that determines whether Blurb print-ready parameters are configurable at all and whether the generation-mode choice (Normal/Blurb/Both) is offered during PDF export. The setting SHALL persist across sessions until changed by the user.

#### Scenario: Blurb mode enabled from Settings
- **WHEN** a user enables "Blurb mode" in Settings
- **THEN** the preference is persisted in D1, the Blurb parameter section becomes visible in Settings, and the generation-mode choice appears in the PDF export flow

#### Scenario: Blurb mode off by default
- **WHEN** Blurb mode has never been configured
- **THEN** Settings shows no Blurb parameter section, and the PDF export flow shows no generation-mode choice - it behaves exactly as it does today (a single Normal export)

### Requirement: Per-zone background colors
Settings SHALL let the user independently choose a persistent background color for the front cover, back cover, and spine, used by every subsequent Blurb export and Blurb preview. Each SHALL default to white. The chosen color for a zone SHALL render as the backdrop behind that zone's existing content (e.g. visible in the margins/gaps around the front cover's photo mosaic) and SHALL NOT replace or hide that content. The back cover's chosen color SHALL NOT apply to the reserved barcode area, which always stays white (see `pdf-blurb-print-spec`).

#### Scenario: Independent colors per zone
- **WHEN** the user sets a red background for the spine and a blue background for the back cover in Settings
- **THEN** every subsequent Blurb cover (export or preview) shows red behind the spine content and blue behind the back cover content, independently of each other

#### Scenario: Defaults to white
- **WHEN** no background color has been chosen for a zone
- **THEN** that zone renders with a white background

#### Scenario: Background color sits behind existing content
- **WHEN** a background color is set for the front cover, which already displays the photo mosaic
- **THEN** the chosen color appears only in the margins/gaps around the mosaic photos, not over them

### Requirement: Configurable spine text
Settings SHALL let the user enter persistent custom spine text and choose its font size, independently of the front cover's title/subtitle configuration, used by every subsequent Blurb export and Blurb preview. When generating a Blurb (or Both) export, once the interior page count is known and the spine width is computed, if the spine is too narrow for the configured text to render legibly, the system SHALL warn the user before generating the cover-wrap PDF, rather than silently dropping the text. If the user proceeds anyway, the spine text SHALL be omitted and the spine SHALL render as color-only.

#### Scenario: Custom spine text rendered
- **WHEN** spine text and a font size are configured in Settings, and the computed spine width for the current export is wide enough for it to render legibly
- **THEN** the cover-wrap PDF renders that text on the spine at the chosen size

#### Scenario: User warned before generation when text won't fit
- **WHEN** the computed spine width for the current export is too narrow for the configured text to render legibly at any reasonable size
- **THEN** the system warns the user before generating the cover-wrap PDF, explaining that the spine text will not appear

#### Scenario: Spine renders color-only after the warning is acknowledged
- **WHEN** the user proceeds with generation after being warned that spine text won't fit
- **THEN** the spine text is omitted entirely and the spine renders as color only

### Requirement: Back cover style choice
Settings SHALL let the user choose a persistent back cover style: either a solid background color (as defined by Per-zone background colors) or a full-cover photo mosaic composed of every photo included in the exported album's date range, used by every subsequent Blurb export and Blurb preview. When the mosaic style is selected, the chosen back-cover background color SHALL still apply as backdrop behind the mosaic's gaps, consistent with how the front cover mosaic already behaves. Either style SHALL respect the safe zone and the reserved barcode area.

#### Scenario: Solid color back cover
- **WHEN** the solid-color style is configured in Settings for the back cover
- **THEN** the back cover renders as the chosen background color with no photos, aside from the reserved barcode area

#### Scenario: Full-album mosaic back cover
- **WHEN** the mosaic style is configured in Settings for the back cover
- **THEN** the back cover renders a photo grid using photos from the exported album's date range, up to the configured maximum, sized to fill the back cover panel while respecting the safe zone and the reserved barcode area

### Requirement: Spine width feedback after interior generation
The system SHALL compute the spine width from the actual interior page count once the interior pages have been generated at the selected format, and SHALL display it to the user before the cover-wrap PDF is produced.

#### Scenario: Spine width shown after page count is known
- **WHEN** the interior pages finish generating at the selected format and the resulting page count is known
- **THEN** the system displays the computed spine width for that page count, cover type, and paper type before generating the cover-wrap PDF

#### Scenario: Spine width recalculates if the configured cover type or paper type changes
- **WHEN** the cover type or paper type configured in Settings changes before generation
- **THEN** the displayed spine width recalculates using the current page count estimate, without requiring the interior to regenerate

#### Scenario: Changing the configured format requires regenerating the interior
- **WHEN** the book format configured in Settings changes and a new export is generated
- **THEN** the interior pages are laid out at the new format's aspect ratio (per `pdf-interior-blurb-layout`), producing a new page count, and the spine width is recomputed from that new count once available

### Requirement: Job flagged as Blurb or normal
Every PDF job record SHALL expose whether it was a Blurb print-ready generation or a normal one, so this is visible without inspecting the job's raw options data. When a single generation request produces multiple jobs (see Generation mode selection), each resulting job SHALL be flagged independently according to its own kind.

#### Scenario: Job list distinguishes Blurb jobs
- **WHEN** a family member views the list of past PDF jobs
- **THEN** each job generated as a Blurb job is clearly marked as such, distinct from normal jobs

#### Scenario: Both mode flags each of its two jobs independently
- **WHEN** a generation request is made with the "Both" mode
- **THEN** the resulting Blurb job is flagged as Blurb and the resulting normal job is flagged as normal, each independently and correctly

## ADDED Requirements

### Requirement: Blurb parameters configured in Settings
When Blurb mode is enabled, Settings SHALL let the user configure the book format (Magazine Premium, Standard Portrait), cover type (Softcover, Hardcover/ImageWrap), and paper type as persistent global values, used by every subsequent Blurb export and Blurb preview. These are no longer entered per export. Interior page count remains derived automatically from the generated interior content (see `pdf-interior-blurb-layout`) and is never a user-entered field.

#### Scenario: Format/cover type/paper type configured once, reused every time
- **WHEN** the user sets format, cover type, and paper type in Settings
- **THEN** every subsequent Blurb export and Blurb preview uses those values without asking again

#### Scenario: No per-export parameter controls
- **WHEN** the user opens the PDF export flow with Blurb mode enabled
- **THEN** no format, cover type, paper type, color, spine text, or back-cover-style controls appear in the export flow - only the generation-mode choice (see Generation mode selection)

### Requirement: Generation mode selection (Normal / Blurb / Both)
When Blurb mode is enabled in Settings, the PDF export flow SHALL let the user choose the generation mode for each export request: **Normal** (today's single whole-album PDF), **Blurb** (the Blurb-formatted content PDF plus cover-wrap, delivered as a linked pair per the existing delivery requirement), or **Both**. When Blurb mode is disabled, no mode choice is shown and every export is a Normal export, matching today's behavior exactly.

Choosing **Both** SHALL create two independent PDF jobs from the single generation request - one Blurb job and one Normal job, covering the same date range - each following its own existing per-job pipeline (rendering, delivery, flagging, progress reporting) with no shared state between the two beyond the originating request's date range.

#### Scenario: Normal mode behaves exactly as today
- **WHEN** the user selects Normal mode and generates
- **THEN** exactly one job is created, producing the single whole-album PDF as it does today

#### Scenario: Blurb mode produces one Blurb job
- **WHEN** the user selects Blurb mode and generates
- **THEN** exactly one job is created, producing the Blurb-formatted content PDF and cover-wrap PDF as a linked pair, using the format/cover type/paper type/colors/spine text/back cover style currently configured in Settings

#### Scenario: Both mode produces two independent jobs
- **WHEN** the user selects Both mode and generates
- **THEN** two jobs are created for the same date range - a Blurb job and a Normal job - each visible independently in the job list with its own progress and its own flag

#### Scenario: No mode choice when Blurb mode is off
- **WHEN** Blurb mode is disabled in Settings
- **THEN** the PDF export flow shows no generation-mode choice and always produces a single Normal job

### Requirement: Blurb cover preview as an explicit action
Settings SHALL offer two separate, explicit preview actions when Blurb mode is enabled: a normal cover preview (today's digital single-page cover) and a Blurb cover preview (the print-ready cover-wrap: front + spine + back), each using the currently-configured Settings values for that representation. The user SHALL NOT have to change any other setting to pick which one to preview.

#### Scenario: Normal preview shows the digital cover
- **WHEN** the user triggers the normal preview action
- **THEN** the plain digital single-page cover renders, using the currently-configured cover title/subtitle/family name/style

#### Scenario: Blurb preview shows the cover-wrap
- **WHEN** the user triggers the Blurb preview action
- **THEN** the print-ready cover-wrap (front + spine + back) renders at the currently-configured format/cover type/paper type/colors/spine text/back cover style

### Requirement: Manual page count for Blurb preview
The Blurb cover preview SHALL let the user manually set a simulated page count via a control bounded by RPI Print's supported page-count range (20-550, in steps of 2 - see `pdf-blurb-print-spec`), used only to compute that preview's spine width and cover-wrap geometry. This value SHALL have no effect on any real export, which always derives its page count from the actual generated interior content.

#### Scenario: Adjusting the slider changes the preview's spine width
- **WHEN** the user moves the page-count control to a different value within the supported range
- **THEN** the next Blurb preview renders with the spine width computed for that page count

#### Scenario: Preview page count never affects real exports
- **WHEN** the user has set a simulated page count for the preview and then generates a real Blurb export
- **THEN** the real export's page count and spine width are computed from its own actual generated interior content, unaffected by the preview's simulated value
