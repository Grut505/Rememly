# pdf-interior-blurb-layout Specification

## Purpose
Lays out the interior "guts" PDF pages at the trim size and aspect ratio matching the Blurb book format selected in Blurb mode, instead of today's A4-ish layout, and reports the resulting page count so the cover's spine width can be computed from real data instead of a manual guess.
## Requirements
### Requirement: Interior pages sized to the selected Blurb format
When Blurb mode is enabled, the system SHALL lay out interior pages at the trim width/height (aspect ratio) of the selected book format, instead of the default A4-ish layout. This applies to page dimensions and aspect ratio only - individual interior pages do NOT receive bleed or a safe-zone margin in this change; the cover remains the only element requiring full print-ready precision.

#### Scenario: Interior pages match the chosen format's aspect ratio
- **WHEN** Blurb mode is enabled and "Magazine Premium" (8.5 × 11in) is selected
- **THEN** every interior page is laid out at the 8.5:11 aspect ratio instead of A4

#### Scenario: Interior layout unaffected when Blurb mode is off
- **WHEN** Blurb mode is disabled
- **THEN** interior pages keep today's A4-ish layout

### Requirement: Page count reported for spine calculation
Once interior pages are generated, the system SHALL report the total resulting page count so it can be used to compute the cover's spine width, without requiring the user to enter or confirm a page count themselves.

#### Scenario: Page count feeds the cover generation step
- **WHEN** interior page generation completes with Blurb mode enabled
- **THEN** the resulting page count becomes available for the print-ready cover's spine-width calculation automatically

### Requirement: Even page count guaranteed
RPI Print requires page counts in multiples of 2. If the naturally generated interior content results in an odd page count, the system SHALL insert a single blank trailing page to reach the next even number, rather than surfacing an error to the user.

#### Scenario: Odd content count is padded
- **WHEN** the generated interior content naturally produces an odd number of pages
- **THEN** the system appends one blank page so the final page count is even

#### Scenario: Even content count is untouched
- **WHEN** the generated interior content already produces an even number of pages
- **THEN** no blank page is added

