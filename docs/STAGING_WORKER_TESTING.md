# Staging Worker Testing

This guide explains how to test the future Worker backend without changing the current Google production backend.

## Principle

- Google Apps Script remains the live production backend
- Worker testing happens only in local or staging environments
- frontend routing to Workers is done via local `.env` changes only

## 1. Prepare the Worker backend

- configure `workers/wrangler.toml`
- install dependencies in `workers/`
- apply local or staging D1 migrations
- import snapshot data into local or staging D1

Useful commands:

```bash
npm run install:workers
npm run workers:db:migrate:local
npm run migrate:d1:build
```

One-command local bootstrap:

```bash
npm run workers:bootstrap:local
```

## 2. Produce migration snapshots from Google

Current recommended preparation flow:

1. deploy the latest Apps Script code if needed
2. from the Apps Script editor, run:

```javascript
exportMigrationSnapshotsToDrive()
```

This creates JSON files in a Drive folder named `Rememly Migration Snapshots`.

3. download those JSON files into `scripts/migrate/snapshots/`

Expected files:

- `users.json`
- `articles.json`
- `jobs_pdf.json`
- `config.json`
- `families.json`
- `famileo_sessions.json`
- `famileo_imports.json`
- `app_logs.json`

## 3. Seed local or staging D1

Build the SQL import file:

```bash
npm run migrate:d1:build
```

Execute locally:

```bash
npm run migrate:d1:local
```

Or execute manually against staging once Wrangler env IDs are configured.

## 4. Point the frontend to Worker staging only

Use `frontend/.env.worker.example` as the template.

Recommended approach:

1. keep your existing `frontend/.env` unchanged for Google dev/prod work
2. create a temporary local worker env file
3. start the frontend with the Worker URL only when explicitly testing staging parity

At minimum, set:

- `VITE_APPS_SCRIPT_URL` to the Worker URL
- `VITE_BACKEND_VERSION` to a staging label

## 5. What should be tested first

Low-risk parity checks:

- `auth/check`
- `users/list`
- `profile/get`
- `articles/list`
- `articles/authors`
- `famileo/families`
- `famileo/imported-ids`
- `famileo/imported-fingerprints`

## 6. What should not be switched yet

Do not consider these production-ready in Worker preparation mode yet:

- heavy PDF rendering
- Famileo refresh automation
- full Famileo post/image proxying
- final file migration to R2 in production

Some Worker endpoints intentionally return explicit `PREPARATION_ONLY` responses instead of `404`, so staging can identify unsupported flows cleanly without silently missing routes.

## 7. Success criteria before any cutover

- Worker endpoints respond with the expected envelope shape
- staging frontend works against Worker routes without breaking core screens
- D1 data matches exported Google snapshots closely enough for meaningful testing
- Google production traffic remains untouched

## 8. Optional parity comparison command

After the Worker is running and seeded, compare a small set of endpoints:

```bash
GOOGLE_BACKEND_URL="https://script.google.com/macros/s/your-deployment/exec" \
WORKER_BASE_URL="http://127.0.0.1:8787" \
MIGRATION_AUTH_EMAIL="you@example.com" \
npm run migrate:compare
```

This surfaces response/status differences early while staying in preparation mode.
