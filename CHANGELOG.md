# Changelog

All notable changes to Rememly will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Initial Release

#### Added

**Frontend (PWA)**
- React 18 with TypeScript and Tailwind CSS
- Mobile-first responsive design with portrait orientation
- Google Sign-In authentication
- Timeline view with infinite scroll
- Article creation and editing
- Photo upload with client-side compression
- Photo assembly module with 5 templates:
  - 2×1 Vertical
  - 2×1 Horizontal
  - 4×4 Grid
  - 3+2
  - 3+2+2
- Zoom and pan controls for photo positioning
- Text input with 300 character limit
- Filters by year, month, and date range
- Statistics view (articles per month/year)
- PWA features:
  - Service Worker for offline support
  - Web App Manifest
  - Installable on mobile devices

**Backend (Google Apps Script)**
- Web App deployment
- Email whitelist authentication
- CRUD operations for articles
- Google Drive integration:
  - Folder structure by year
  - Image storage (originals, assembled)
  - PDF storage
- Google Sheets integration:
  - Articles metadata storage
  - PDF jobs tracking
- Asynchronous PDF generation:
  - Cover page with photo mosaic
  - Month dividers (January-December)
  - Article pages (2 per page or full page)
  - A4 format optimized for printing
- Job system with status polling

**Documentation**
- Complete README with features and setup
- Detailed SETUP.md guide
- Backend README with clasp instructions
- Contributing guidelines
- Specifications (SPEC-001 to SPEC-006)

#### Technical Features
- TypeScript throughout (frontend and backend)
- Zustand state management
- IndexedDB for draft storage
- Image compression and EXIF correction
- Europe/Paris timezone
- Mobile-first CSS with Tailwind
- French month names in PDFs

### Known Limitations
- No automated tests
- PDF generation limited by Google Apps Script execution time
- Icons are placeholders (need custom design)
- Authentication simplified (production should use full OAuth2 verification)

### Future Enhancements (Roadmap)
- [ ] Push notifications for shared articles
- [ ] Multiple photo selection in photo picker
- [ ] Photo filters and editing
- [ ] Export individual articles as images
- [ ] Multiple PDF templates
- [ ] Email notifications for PDF completion
- [ ] Automated tests (Jest, Playwright)
