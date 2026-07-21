# Migration Execution Plan

This document is the execution-ready plan for migrating Rememly away from Google Apps Script + Google Sheets.

It is intentionally opinionated. The goal is to reduce decision fatigue and define a path that can actually be executed with low risk.

## Current execution mode

Preparation mode only:

- Google Apps Script + Google Sheets remain the live production backend
- all Worker/D1/R2 work is additive and non-invasive for now
- no frontend production traffic should be switched until staging parity is validated

See also:

- `docs/STAGING_WORKER_TESTING.md`

## Chosen target

### Core platform

- `Frontend`: existing Vite frontend
- `API`: Cloudflare Workers
- `Database`: Cloudflare D1
- `File storage`: Cloudflare R2

### PDF strategy

For PDF generation, the recommended execution target is:

- `Workers + D1 + R2` for API, metadata, orchestration, uploads, downloads, and job tracking
- `GitHub Actions` for the heavy asynchronous PDF rendering / merge worker during the first migration

This is the safest path because the current PDF pipeline is already chunked and partially offloaded, and the PDF logic is the most runtime-sensitive part of the system.

## Why the PDF strategy is different

The current PDF flow is not a simple synchronous endpoint.

It currently includes:

- batch orchestration with queued jobs
- chunk-by-chunk rendering to avoid timeouts
- repeated article grouping and page numbering logic
- intermediate file creation
- large PDF merge steps
- callbacks and progress tracking

Relevant current files:

- `backend/src/pdf.js`
- `backend/src/jobs.js`
- `.github/workflows/pdf-merge.yml`
- `scripts/merge_pdf_from_drive.py`

## Short answer on Workers and PDFs

### Can Workers handle all PDF-related features?

Yes for:

- creating PDF jobs
- storing job state
- generating cover preview metadata
- exposing status endpoints
- uploading/downloading files from R2
- triggering background work
- receiving progress callbacks

Not recommended initially for heavy final generation and merge inside a normal request/response Worker path.

### Recommended production stance

- do not put the full final PDF generation and merge inside a standard Worker request
- keep heavy PDF rendering asynchronous
- keep a dedicated executor for the heavy phase until the Cloudflare-native path is proven safe

For a strict low-cost migration, GitHub Actions remains the safest executor for the heavy PDF phase.

## Final recommended architecture after migration

### Core app

- frontend -> Worker API -> D1 / R2

### PDF subsystem

- frontend creates PDF job via Worker
- Worker stores job in D1 and queue state
- background executor generates PDF chunks and final file
- executor writes files to R2
- executor updates Worker callbacks / D1 status
- frontend polls Worker for job status

## Decision log

These decisions are now considered the default migration path unless explicitly changed later.

- `Decision 1`: replace Apps Script as the main API runtime
- `Decision 2`: replace Google Sheets as the primary datastore
- `Decision 3`: use D1 as the first relational store
- `Decision 4`: use R2 as the long-term binary store
- `Decision 5`: keep the PDF heavy execution phase asynchronous
- `Decision 6`: keep GitHub Actions for heavy PDF execution during the first safe migration

## Repository changes to prepare later

Planned future top-level structure:

```text
frontend/
backend/                # legacy Apps Script during transition
workers/
  src/
  migrations/
  wrangler.toml
scripts/
docs/
```

## Phase-by-phase execution plan

## Phase 0 - Freeze scope and collect production facts

Objective:

- ensure migration assumptions match reality before building the new stack

Tasks:

- [ ] list all active production endpoints from `backend/src/main.js`
- [ ] list all active production sheets and properties
- [ ] identify which sheets are source-of-truth versus operational/cache-like sheets
- [ ] inventory all secrets currently in Apps Script and GitHub
- [ ] identify all Google Drive dependencies
- [ ] capture current production pain points with rough timings if possible

Exit criteria:

- a complete inventory exists
- there is no unknown critical production dependency

## Phase 1 - Create the Cloudflare foundation

Objective:

- provision the future runtime without changing production traffic yet

Tasks:

- [ ] create a Cloudflare Worker project under `workers/`
- [ ] create one D1 database for staging
- [ ] create one D1 database for production
- [ ] create one R2 bucket for staging
- [ ] create one R2 bucket for production
- [ ] define Worker environment variables and secrets
- [ ] add local development instructions

Artifacts to produce:

- `workers/wrangler.toml`
- `workers/src/index.ts`
- `workers/src/routes/*`
- `workers/src/lib/*`
- `workers/migrations/*.sql`

Status in repo:

- initial skeleton created under `workers/`
- first migration created in `workers/migrations/0001_initial.sql`

Exit criteria:

- Worker project boots locally
- D1 and R2 bindings are configured

## Phase 2 - Lock the data model

Objective:

- define the relational schema before moving live data

Tasks:

- [ ] finalize the D1 schema from `docs/FUTURE_ARCHITECTURE_SQL.md`
- [ ] keep current field names where compatibility matters
- [ ] define indexes for all read-heavy queries
- [ ] define which old config values become Worker secrets
- [ ] define which old config values remain normal database config

Must-have tables:

- `users`
- `articles`
- `jobs_pdf`
- `config`
- `families`
- `famileo_sessions`
- `famileo_imports`
- optional `app_logs`

Exit criteria:

- first migration SQL file is ready to apply

## Phase 3 - Build data export and import tooling

Objective:

- guarantee production data can move safely and repeatably

Tasks:

- [ ] export users from Sheets
- [ ] export articles from Sheets
- [ ] export jobs from Sheets
- [ ] export families/config/session-related data
- [ ] create import scripts into D1
- [ ] validate row counts and critical identifiers after import
- [ ] create repeatable staging import workflow

Recommended deliverables:

- `scripts/migrate/export_from_sheets.*`
- `scripts/migrate/import_to_d1.*`
- validation script comparing source counts and target counts

Exit criteria:

- staging database can be rebuilt from exports reliably

## Phase 4 - Rebuild the read API first

Objective:

- get immediate performance wins with minimal product risk

Endpoints to migrate first:

- [ ] `users/list`
- [ ] `profile/get`
- [ ] `articles/authors`
- [ ] `articles/list`
- [ ] `famileo/families`
- [ ] `famileo/imported-ids`
- [ ] `famileo/imported-fingerprints`
- [ ] `config/get`

Implementation rules:

- preserve response envelopes where possible
- preserve current French/English domain field naming
- paginate in SQL, not after loading everything
- add query-level filtering and sorting

Exit criteria:

- staging frontend works for read-heavy screens against Workers
- article and user reads are measurably faster than Apps Script

## Phase 5 - Rebuild the write API

Objective:

- move mutation flows onto D1 while preserving UI behavior

Endpoints:

- [ ] `articles/create`
- [ ] `articles/update`
- [ ] `articles/delete`
- [ ] `articles/permanent-delete`
- [ ] `profile/save`
- [ ] `config/set` for non-secret values

Rules:

- keep soft delete semantics unchanged
- preserve `status` values
- preserve existing article IDs if feasible
- return errors in the same envelope style as current backend

Exit criteria:

- create/edit/delete flows work in staging with the current frontend

## Phase 6 - Move file handling to R2

Objective:

- separate binary storage from application state

Tasks:

- [ ] define R2 object key conventions for article images and generated PDFs
- [ ] implement upload path in Workers
- [ ] implement secure download/access strategy
- [ ] decide whether old Drive assets are migrated now or later
- [ ] update metadata persistence to store R2 keys/URLs instead of Drive IDs when applicable

Recommended key conventions:

- `articles/{article_id}/original/{filename}`
- `articles/{article_id}/derived/{filename}`
- `pdf/{job_id}/chunks/{filename}`
- `pdf/{job_id}/final/{filename}`

Exit criteria:

- new uploads and generated files can be stored/retrieved via R2

## Phase 7 - Migrate Famileo flows

Objective:

- move Famileo integration off Apps Script without breaking session-sensitive behavior

Endpoints:

- [ ] `famileo/status`
- [ ] `famileo/posts`
- [ ] `famileo/image`
- [ ] `famileo/trigger-refresh`
- [ ] `famileo/create-post`
- [ ] `famileo/presigned-image`
- [ ] `famileo/upload-image`

Storage decisions:

- keep Famileo session state in D1 or another secure store managed by Workers
- keep encryption secrets in Worker secrets, not in D1

Background refresh decision:

- keep GitHub Actions for Famileo refresh if it remains the most stable login executor
- Workers should orchestrate and persist state, but the login automation can remain offloaded initially

Exit criteria:

- Famileo browsing, refresh, and posting work from the Worker backend

## Phase 8 - Rebuild PDF orchestration in Workers

Objective:

- move PDF control plane first, not the riskiest execution path

Endpoints to move:

- [ ] `pdf/create`
- [ ] `pdf/status`
- [ ] `pdf/list`
- [ ] `pdf/delete`
- [ ] `pdf/cancel`
- [ ] `pdf/merge-trigger`
- [ ] `pdf/merge-token-status`
- [ ] `pdf/merge-token-refresh`
- [ ] `pdf/cover-preview`
- [ ] `pdf/cover-preview-delete`
- [ ] `pdf/cover-preview-content`

Worker responsibilities in this phase:

- accept and validate PDF jobs
- persist job state in D1
- stage files and metadata in R2
- expose progress/status to the frontend
- trigger background executor jobs
- receive progress/failure/completion callbacks

Exit criteria:

- frontend uses Worker-based PDF job endpoints successfully
- no job state depends on Google Sheets anymore

## Phase 9 - Keep heavy PDF execution asynchronous

Objective:

- migrate safely without destabilizing the most fragile part of the system

Recommended first execution model:

- Worker creates a PDF job row in D1
- Worker triggers GitHub Action for heavy rendering / merge
- GitHub Action fetches the source data from Worker endpoints or job payload storage
- GitHub Action renders chunks and final PDF
- GitHub Action uploads results to R2
- GitHub Action calls Worker callbacks to update `jobs_pdf`

Why this is the default first model:

- current PDF system already uses a background workflow for merge
- PDF generation has batching and timeout pressure today
- GitHub Actions is more forgiving for CPU/memory-heavy or long-running PDF work than a regular Worker request path

Exit criteria:

- end-to-end PDF generation works without Apps Script job storage

## Phase 10 - Optional Cloudflare-native PDF execution later

Objective:

- evaluate whether the heavy PDF phase can be moved fully out of GitHub Actions

This phase is optional and should happen only after the first migration is stable.

Possible future approaches:

- Worker orchestrates jobs via queue/consumer pattern
- external browser/PDF rendering service
- Cloudflare-native async architecture if runtime constraints are acceptable

Warning:

- do not commit to full in-Worker heavy PDF rendering until real-world tests prove it is stable for your largest books

Exit criteria:

- only proceed if tested documents complete reliably under expected load and size

## Phase 11 - Cut over production traffic

Objective:

- move the live application to the new backend with rollback safety

Tasks:

- [ ] deploy Worker staging
- [ ] run full frontend smoke tests against staging
- [ ] export fresh production sheet snapshots
- [ ] import fresh production data into production D1
- [ ] update frontend API base URL to the Worker endpoint
- [ ] monitor production latency and errors closely
- [ ] keep the Apps Script backend available for rollback during the first days

Exit criteria:

- production traffic is served by Workers
- core screens are stable

## Phase 12 - Decommission legacy backend carefully

Objective:

- remove old dependencies only after confidence is high

Tasks:

- [ ] stop using Sheets as the source of truth
- [ ] remove old Apps Script write paths
- [ ] archive legacy data exports
- [ ] remove obsolete secrets and properties
- [ ] keep only narrowly justified Google automations if still useful

Exit criteria:

- Apps Script is no longer on the critical request path

## Production acceptance checklist

The migration is only considered complete when all are true:

- [ ] article list is faster than before
- [ ] profile and user lookups no longer scan sheet data
- [ ] Famileo import lookups are indexed and fast
- [ ] write flows are reliable
- [ ] PDF job tracking is fully off Sheets
- [ ] final PDF files are stored outside Google Drive unless explicitly retained temporarily
- [ ] rollback plan has been removed only after proven stability

## Immediate implementation order

If execution starts now, the order should be:

1. create `workers/` project
2. add D1 migrations
3. write export/import scripts
4. migrate read endpoints
5. migrate write endpoints
6. migrate Famileo orchestration
7. migrate PDF control plane
8. keep GitHub Actions for heavy PDF execution
9. cut over frontend traffic
10. decommission Apps Script

## Non-goals for phase 1

These are deliberately out of scope for the first migration wave:

- redesigning the frontend API shape everywhere
- renaming all French domain fields to English
- rewriting PDF generation logic for elegance alone
- moving the heaviest PDF rendering fully inside Workers before validation

## Recommended answer to the PDF question

If asked whether Workers can handle the PDF system, the operational answer should be:

- `yes` for orchestration, metadata, callbacks, storage integration, and status APIs
- `not as the first production home for the heaviest rendering and merge path`

So the execution-ready recommendation is:

- migrate the app to `Workers + D1 + R2`
- keep heavy PDF execution asynchronous and offloaded at first
- use GitHub Actions as the first stable executor for the heavy PDF phase
