# Migration Scripts

These scripts are preparation tools only.

They do not change the current production Google Apps Script / Google Sheets backend unless you explicitly execute migration commands against the Worker stack.

## Current operating mode

- production continues to run on Google Apps Script + Google Sheets
- Worker/D1/R2 work stays in preparation mode
- snapshot imports are for local or staging validation first

## Snapshot export from Apps Script

The repository now includes a manual Apps Script helper in `backend/src/migration_exports.js`.

Run this from the Apps Script editor:

```javascript
exportMigrationSnapshotsToDrive()
```

It writes JSON snapshot files to a Drive folder named `Rememly Migration Snapshots`.

## Expected snapshot files

Place JSON snapshots in `scripts/migrate/snapshots/`:

- `users.json`
- `articles.json`
- `jobs_pdf.json`
- `config.json`
- `families.json`
- `famileo_sessions.json`
- `famileo_imports.json`
- `app_logs.json`

Each file should contain an array of plain objects.

## Generate SQL from snapshots

```bash
node scripts/migrate/import-snapshots-to-d1.mjs
```

Default output:

- `scripts/migrate/generated/import_snapshot.sql`

## Bootstrap local Worker preparation

```bash
npm run workers:bootstrap:local
```

This installs Worker dependencies, applies local D1 migrations, and imports snapshots if JSON files are present.

## Generate SQL from a custom directory

```bash
node scripts/migrate/import-snapshots-to-d1.mjs --snapshots /path/to/snapshots --out /tmp/import.sql
```

## Execute against local D1

```bash
node scripts/migrate/import-snapshots-to-d1.mjs --execute local
```

## Execute against staging D1

```bash
node scripts/migrate/import-snapshots-to-d1.mjs --execute staging
```

## Important note

This script assumes D1 schema migrations were already applied first.

Run schema migration before importing snapshots:

```bash
cd workers
npm run db:migrate:local
```

## Compare Google and Worker responses

Once the Worker is running locally or in staging, compare a small set of endpoints against the Google backend:

```bash
GOOGLE_BACKEND_URL="https://script.google.com/macros/s/your-deployment/exec" \
WORKER_BASE_URL="http://127.0.0.1:8787" \
MIGRATION_AUTH_EMAIL="you@example.com" \
npm run migrate:compare
```

This is a preparation aid only. It helps identify response-shape differences before any frontend cutover.
