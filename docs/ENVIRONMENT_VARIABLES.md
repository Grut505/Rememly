# Environment & Secrets Reference

This page centralizes all environment variables / secrets used by Rememly.

## Google Apps Script Script Properties

Required:
- `FAMILEO_UPDATE_TOKEN` — secret token used by GitHub Actions to update Famileo sessions and fetch encrypted credentials.
- `FAMILEO_PW_KEY` — encryption key used to store Famileo passwords in the users sheet.
- `GITHUB_TOKEN` — token to trigger GitHub workflows (Famileo refresh / PDF merge).
- `PDF_MERGE_TOKEN` — token used by PDF merge callbacks.

Optional / Auto:
- `SPREADSHEET_ID` — created automatically on first run if missing.
- `FAMILEO_FAMILY_ID` — fallback Famileo family id if none is provided.

Internal (do not set manually):
- `PDF_JOB_QUEUE`

## GitHub Secrets (Workflows)

Required:
- `BACKEND_URL` — Apps Script Web App URL.
- `BACKEND_SECRET_TOKEN` — same value as `FAMILEO_UPDATE_TOKEN` (Script Properties).
- `FAMILEO_PW_KEY` — same value as `FAMILEO_PW_KEY` (Script Properties).
- `PDF_MERGE_TOKEN` — same value as `PDF_MERGE_TOKEN` (Script Properties).
- `GDRIVE_CREDENTIALS_JSON`
- `GDRIVE_TOKEN_JSON`

Deprecated (should be removed):
- `FAMILEO_EMAIL`
- `FAMILEO_PASSWORD`
