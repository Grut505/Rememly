# Future Architecture Proposal

This document captures a future architecture direction for Rememly if performance becomes the priority and the current Google Apps Script + Google Sheets backend becomes too limiting.

Related documents:

- `docs/FUTURE_ARCHITECTURE_SQL.md` - first-pass D1 schema draft
- `docs/MIGRATION_CHECKLIST.md` - step-by-step migration execution checklist
- `docs/MIGRATION_EXECUTION_PLAN.md` - opinionated A-to-Z rollout plan and PDF strategy

## Recommended target architecture

Ideal long-term stack:

- `Frontend`: static Vite app, unchanged in principle
- `API`: Cloudflare Workers
- `Database`: Cloudflare D1
- `File storage`: Cloudflare R2

This is the preferred target because it removes both major current bottlenecks:

- Google Apps Script request latency and execution limits
- Google Sheets full-sheet scans used as the main datastore

## Why move away from Google Sheets + Apps Script

Current architecture is simple and cost-effective, but it has predictable performance limits:

- many backend operations read entire sheets before filtering
- auth and user lookups can require sheet scans
- pagination often happens after in-memory filtering/sorting
- write operations are sometimes row-by-row or cell-by-cell
- Apps Script adds runtime limits, quotas, and cold-start-like latency

As data volume grows, latency grows with total sheet size rather than only with the requested result set.

## Why Workers + D1 + R2

### Cloudflare Workers

Use Workers as the main API layer.

Benefits:

- much lower request overhead than Apps Script
- no Google Apps Script execution model constraints
- good fit for lightweight JSON APIs
- easy secret management for API keys and tokens
- works well with a static frontend

### Cloudflare D1

Use D1 for application data previously stored in Sheets.

Benefits:

- SQL queries instead of full-sheet scans
- indexes for fast lookup on common fields
- proper pagination at query level
- better model for articles, users, jobs, config, and logs
- simpler future reporting and maintenance

Likely tables:

- `users`
- `articles`
- `jobs_pdf`
- `config`
- `famileo_sessions`
- `logs` or specialized log tables if needed

### Cloudflare R2

Use R2 for uploaded files, generated PDFs, and long-lived assets.

Benefits:

- object storage is a better fit than Drive for application files
- simpler integration with Workers
- no need for Apps Script to broker uploads/downloads
- good long-term destination for images, generated exports, and attachments

## Recommended migration strategy

The safest path is progressive, not a big-bang rewrite.

### Phase 1: move API and database first

Recommended transitional architecture:

- `Frontend`: unchanged
- `API`: Cloudflare Workers
- `Database`: D1
- `Files`: keep Google Drive temporarily

Why this first:

- biggest performance win comes from replacing Apps Script + Sheets for application reads/writes
- file migration can be delayed to reduce risk
- existing Drive-based flows can keep working while the data layer is modernized

### Phase 2: move file storage to R2

After API and DB are stable:

- migrate stored files to R2
- update upload/download flows to go through Workers and R2
- remove remaining Drive-specific dependencies where possible

### Phase 3: retire Apps Script

Once all critical endpoints are migrated:

- stop using Apps Script as the main backend
- keep it only if a narrow Google-specific automation still justifies it
- otherwise remove it completely

## What would move to D1 first

Priority data domains:

1. `users`
2. `articles`
3. `jobs_pdf`
4. `config`
5. Famileo imported ids / fingerprints tracking
6. optional application logs

These are the parts most likely to benefit from indexed lookups and proper query pagination.

## What could stay on Google Drive temporarily

During migration, keeping Drive is acceptable for:

- article images already stored there
- generated PDF files
- other existing binary assets

Workers can still interact with Google Drive through the Google Drive API, but this is a transitional compromise rather than the ideal final state.

## Notes about Workers and Google Drive

Cloudflare Workers can upload to and read from Google Drive via the Google Drive HTTP API.

This is possible with:

- an OAuth refresh token stored as a secret
- or a service account if the storage model allows it

So it is technically possible to use:

- `Workers + D1 + Google Drive`

But the cleaner long-term target remains:

- `Workers + D1 + R2`

## Expected performance improvements

Compared with the current model, the target architecture should improve:

- article list pagination
- user lookups and auth-related reads
- imported Famileo post lookups
- job tracking for PDF generation
- overall request latency
- scalability as row/file count grows

The main reason is that indexed SQL queries replace repeated full-sheet scans.

## Trade-offs

Benefits:

- much better performance characteristics
- cleaner separation between API, database, and file storage
- easier future evolution
- less dependence on Google Apps Script limitations

Costs / complexity:

- migration effort is non-trivial
- schema design and data migration are required
- auth, storage, and background workflows need to be reconnected carefully
- operational setup moves from Google-centric tooling to Cloudflare tooling

## Proposed default direction

If and when Rememly is migrated for performance reasons, the default recommendation is:

- final target: `Cloudflare Workers + D1 + R2`
- transitional step: `Cloudflare Workers + D1 + Google Drive`

For PDF generation specifically, the default migration recommendation is more conservative:

- move PDF orchestration, status, storage, and callbacks to Workers/D1/R2
- keep heavy final PDF rendering / merge asynchronous and offloaded first
- use GitHub Actions as the first stable heavy executor during migration

This gives the best balance between immediate gains, zero/low-cost operation, and a clean long-term architecture.

## Open migration questions for later

When implementation starts, confirm:

- whether auth should remain email-based or move to a more standard token/session model
- whether Famileo session storage belongs in D1, KV, or encrypted secrets/config
- whether PDF generation stays in the same runtime or moves to a dedicated worker/job flow
- whether old Drive assets should be migrated or only new files should use R2
- whether Apps Script should remain for any Google-specific maintenance automation

## Detailed migration plan

This section turns the architecture proposal into a practical rollout sequence.

### Step 0: prepare the target stack

- create a Cloudflare Worker project
- provision one D1 database for application data
- provision one R2 bucket for files and generated artifacts
- define environments for local, staging, and production
- move sensitive values to Worker secrets

Expected secrets/config:

- auth secret or signing secret
- Famileo credentials/config secrets as needed
- Google OAuth refresh token or service account credentials if Drive remains during transition
- optional admin/maintenance secrets

### Step 1: define the SQL schema

Before moving traffic, define D1 tables and indexes that mirror current data behavior.

Minimum schema to introduce first:

- `users`
- `articles`
- `jobs_pdf`
- `config`
- `famileo_sessions`
- `famileo_imports`
- optional `app_logs`

Important indexes to create early:

- `users(email)` unique
- `articles(date)`
- `articles(auteur)`
- `articles(status)`
- `articles(famileo_post_id)`
- `jobs_pdf(status, created_at)`
- `famileo_imports(post_id)` unique
- `famileo_imports(fingerprint)`

### Step 2: export Google Sheets data

- export current sheets to JSON or CSV snapshots
- validate row counts and key fields before import
- keep field names compatible with current mixed English/French domain vocabulary
- preserve current IDs where possible to avoid breaking the frontend

Suggested import order:

1. `users`
2. `articles`
3. `config`
4. `jobs_pdf`
5. Famileo session/config rows
6. log/history rows if worth preserving

### Step 3: implement the new API in Workers

- recreate current HTTP contract endpoint by endpoint
- keep response envelopes compatible with the existing frontend where possible
- preserve current field names unless a deliberate migration is planned
- add indexes and SQL pagination before switching traffic

The goal is to let the frontend keep working with minimal changes during the first cutover.

### Step 4: migrate low-risk reads first

Start with endpoints that are read-heavy and easy to validate:

- `users/list`
- `profile/get`
- `articles/authors`
- `articles/list`
- `famileo/imported-ids`
- `famileo/imported-fingerprints`

This delivers the fastest visible performance wins with the lowest risk.

### Step 5: migrate writes and job flows

Then migrate:

- `articles/create`
- `articles/update`
- `articles/delete`
- `profile/save`
- PDF job creation / status / cancellation
- Famileo session state persistence

At this point, D1 becomes the main system of record.

### Step 6: move binary storage from Drive to R2

- decide whether to migrate existing files or only new files
- introduce stable object key conventions
- keep metadata in D1 and binaries in R2
- add signed upload/download flows if private assets are needed

### Step 7: remove Apps Script from the critical path

- point frontend API traffic fully to Workers
- stop using Google Sheets as the main datastore
- keep Apps Script only for temporary maintenance tooling if still useful
- remove it entirely once no production flow depends on it

## Proposed D1 data model

This is not final SQL, but a pragmatic starting point.

### `users`

Purpose:

- store app users and profile data

Suggested columns:

- `id`
- `email`
- `name`
- `pseudo`
- `role`
- `famileo_email`
- `famileo_password_enc`
- `is_declared_author`
- `created_at`
- `updated_at`

### `articles`

Purpose:

- replace the articles sheet with indexed article storage

Suggested columns:

- `id`
- `date`
- `auteur`
- `author_pseudo`
- `texte`
- `image_url`
- `image_file_id`
- `assembly_state_json`
- `full_page`
- `status`
- `famileo_post_id`
- `famileo_fingerprint`
- `created_at`
- `updated_at`

### `jobs_pdf`

Purpose:

- track PDF generation and merge workflow state

Suggested columns:

- `job_id`
- `status`
- `progress`
- `progress_message`
- `pdf_file_id`
- `pdf_url`
- `chunks_folder_id`
- `chunks_folder_url`
- `created_at`
- `created_by`
- `created_by_pseudo`
- `date_from`
- `date_to`
- `error_message`

### `config`

Purpose:

- store non-secret application configuration currently kept in script properties or config sheets

Suggested columns:

- `key`
- `value`
- `updated_at`

Secrets should not live in D1 if Worker secrets are a better fit.

### `famileo_sessions`

Purpose:

- store the current Famileo session state separately from general config

Suggested columns:

- `famileo_email`
- `phpsessid`
- `rememberme`
- `updated_at`
- `expires_at` if derivable

### `famileo_imports`

Purpose:

- fast lookup of imported Famileo items without scanning all articles

Suggested columns:

- `id`
- `post_id`
- `fingerprint`
- `article_id`
- `imported_at`

### `app_logs`

Purpose:

- optional operational logs currently written into sheets

Suggested columns:

- `id`
- `category`
- `level`
- `message`
- `context_json`
- `created_at`

If log volume becomes large, use external logging later instead of growing D1 indefinitely.

## Endpoint migration map

The easiest migration path is to keep endpoint names stable while changing the backend implementation.

### Auth and profile

- `auth/check` -> Worker auth/session validation backed by D1 `users`
- `profile/get` -> D1 user/profile read
- `profile/save` -> D1 user/profile update
- `users/list` -> D1 query instead of sheet scan

### Articles

- `articles/list` -> SQL query with indexed filters, sort, and pagination
- `articles/authors` -> SQL distinct/aggregation query
- `articles/get` -> single indexed lookup by `id`
- `articles/create` -> insert into D1
- `articles/update` -> update in D1
- `articles/delete` -> soft delete flag in D1
- `articles/permanent-delete` -> hard delete in D1
- `articles/backfill-famileo-fingerprints` -> one-off migration/admin Worker task

### PDF flows

- `pdf/create` -> create job row in `jobs_pdf`
- `pdf/status` -> indexed lookup by `job_id`
- `pdf/list` -> paginated SQL query
- `pdf/delete` -> remove metadata and linked object storage file
- `pdf/cancel` -> update job state
- `pdf/merge-trigger` -> Worker-triggered async process
- `pdf/merge-token-status` -> Worker health/config endpoint
- `pdf/merge-token-refresh` -> Worker-managed token refresh logic

PDF generation itself may need a dedicated async worker pattern if it grows beyond normal Worker limits.

### Famileo flows

- `famileo/status` -> Worker check using stored session state
- `famileo/posts` -> Worker proxy to Famileo using stored session
- `famileo/image` -> Worker proxy or signed fetch path
- `famileo/trigger-refresh` -> Worker-triggered refresh flow
- `famileo/families` -> D1-backed family table or config source
- `famileo/imported-ids` -> indexed lookup in `famileo_imports`
- `famileo/imported-fingerprints` -> indexed lookup in `famileo_imports`
- `famileo/create-post` -> Worker proxy to Famileo
- `famileo/presigned-image` -> Worker implementation replacing Apps Script logic
- `famileo/upload-image` -> Worker upload flow, eventually R2-backed

### Config and logs

- `config/get` -> D1 config read or Worker secret-backed lookup depending on key
- `config/set` -> D1 config update for non-secret values only
- `config/links` -> Worker-generated admin links or static config payload
- `logs/pdf/range` -> SQL-backed log query
- `logs/pdf/clear` -> SQL delete/archive
- `logs/famileo/range` -> SQL-backed log query
- `logs/famileo/clear` -> SQL delete/archive

## Suggested cutover strategy

To reduce risk, avoid switching everything at once.

Recommended cutover order:

1. deploy Workers in parallel with Apps Script
2. import a production-like data snapshot into D1
3. validate read endpoints against the current frontend
4. switch one screen or endpoint group at a time
5. migrate writes only after read parity is confirmed
6. move file storage last unless Drive becomes the main blocker

If needed, a temporary compatibility layer can keep current response shapes identical while the internals change.

## Free-tier guidance

The architecture is chosen because it can stay very low cost or free for a personal/family app, but limits still need review at migration time.

- Workers free usage should be checked against real request volume
- D1 free limits should be checked against row count and query patterns
- R2 is operationally simple, but storage and operation costs should still be reviewed if file volume grows

The intended direction remains cost-conscious, but it should always be validated against actual usage rather than assumed indefinitely free.
