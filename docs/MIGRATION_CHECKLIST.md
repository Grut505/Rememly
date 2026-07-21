# Migration Checklist

This checklist is a practical execution guide for migrating Rememly from Google Apps Script + Google Sheets to Cloudflare Workers + D1 + R2.

It assumes a progressive migration, not a full rewrite in one step.

## 1. Planning

- [ ] confirm the target architecture is `Workers + D1 + R2`
- [ ] decide whether Google Drive remains temporarily during phase 1
- [ ] decide whether auth remains email-based for the first migration cut
- [ ] list all production secrets currently stored in Apps Script properties and GitHub secrets
- [ ] identify which current Google Sheets tabs are still actively used in production
- [ ] define rollback strategy before changing production traffic

## 2. Inventory current system

- [ ] inventory all current API endpoints from `backend/src/main.js`
- [ ] inventory all current sheets and their effective schema
- [ ] inventory all script properties currently used by production
- [ ] inventory all file storage flows currently using Google Drive
- [ ] inventory all GitHub workflow dependencies and callbacks
- [ ] inventory all frontend screens that depend on specific response shapes

## 3. Provision Cloudflare resources

- [ ] create the Worker project
- [ ] create the D1 database
- [ ] create the R2 bucket
- [ ] create local, staging, and production environments
- [ ] configure Worker secrets for all sensitive values
- [ ] document the new environment variables and secrets

## 4. Define the D1 schema

- [ ] create initial tables for `users`, `articles`, `jobs_pdf`, `config`, `famileo_sessions`, `famileo_imports`, and optional logs
- [ ] create indexes for the main read paths
- [ ] preserve current mixed English/French field vocabulary where needed
- [ ] decide which current sheet fields become SQL columns vs JSON text
- [ ] decide which values belong in D1 vs Worker secrets

Reference: `docs/FUTURE_ARCHITECTURE_SQL.md`

## 5. Export and validate production data

- [ ] export `users` sheet snapshot
- [ ] export `articles` sheet snapshot
- [ ] export `jobs_pdf` sheet snapshot if applicable
- [ ] export config/family/session-related sheets or properties as needed
- [ ] verify row counts before import
- [ ] verify unique identifiers before import
- [ ] verify date formats before import
- [ ] verify no critical production-only fields are missed

## 6. Build import scripts

- [ ] create import scripts for `users`
- [ ] create import scripts for `articles`
- [ ] create import scripts for `jobs_pdf`
- [ ] create import scripts for `config`
- [ ] create import scripts for `families` if needed
- [ ] create import scripts for Famileo sessions/import tracking if needed
- [ ] run imports against a staging D1 database first
- [ ] validate imported row counts against source snapshots

## 7. Rebuild low-risk read endpoints first

- [ ] `users/list`
- [ ] `profile/get`
- [ ] `articles/authors`
- [ ] `articles/list`
- [ ] `famileo/imported-ids`
- [ ] `famileo/imported-fingerprints`

For each endpoint:

- [ ] keep request/response shape compatible with the current frontend if possible
- [ ] verify filtering and pagination behavior
- [ ] compare staging responses against production behavior
- [ ] verify performance is improved versus the sheet-based version

## 8. Rebuild write endpoints

- [ ] `articles/create`
- [ ] `articles/update`
- [ ] `articles/delete`
- [ ] `articles/permanent-delete`
- [ ] `profile/save`
- [ ] `config/set` for non-secret values only

For each write flow:

- [ ] verify idempotency where relevant
- [ ] verify timestamps are preserved correctly
- [ ] verify soft delete vs hard delete semantics match production expectations
- [ ] verify the frontend still handles errors correctly

## 9. Rebuild Famileo flows

- [ ] migrate `famileo/status`
- [ ] migrate `famileo/posts`
- [ ] migrate `famileo/image`
- [ ] migrate `famileo/trigger-refresh`
- [ ] migrate `famileo/families`
- [ ] migrate `famileo/create-post`
- [ ] migrate `famileo/presigned-image`
- [ ] migrate `famileo/upload-image`

Decisions to lock before production cutover:

- [ ] where Famileo session cookies are stored
- [ ] how refresh jobs are triggered
- [ ] whether uploaded images stay on Drive temporarily or move to R2 immediately

## 10. Rebuild PDF flows

- [ ] migrate `pdf/create`
- [ ] migrate `pdf/status`
- [ ] migrate `pdf/list`
- [ ] migrate `pdf/delete`
- [ ] migrate `pdf/cancel`
- [ ] migrate `pdf/merge-trigger`
- [ ] migrate token status/refresh related endpoints

Before cutover:

- [ ] verify how long-running PDF tasks will be orchestrated outside Apps Script
- [ ] verify generated file metadata is stored in D1
- [ ] verify generated binary files are stored on Drive temporarily or R2 finally

## 11. File storage migration

If keeping Google Drive first:

- [ ] implement Worker-to-Drive integration
- [ ] store Drive auth material in Worker secrets
- [ ] verify upload/download permissions

If moving to R2:

- [ ] define object key naming conventions
- [ ] define public vs private access model
- [ ] implement signed upload/download if needed
- [ ] migrate existing files or define a dual-read strategy

## 12. Frontend migration strategy

- [ ] keep the frontend API contract stable for the first phase if possible
- [ ] introduce environment-based API base URL switching
- [ ] test key screens against the staging Worker backend
- [ ] verify error handling remains user-friendly
- [ ] verify mobile flows still work correctly

Highest-priority screens to validate:

- [ ] timeline
- [ ] editor
- [ ] profile
- [ ] Famileo browser
- [ ] PDF export
- [ ] settings/maintenance flows

## 13. Validation and acceptance

- [ ] compare response parity on critical endpoints
- [ ] benchmark article list latency before/after
- [ ] benchmark Famileo imported lookup latency before/after
- [ ] benchmark profile/user lookups before/after
- [ ] validate PDF job creation and tracking
- [ ] validate Famileo refresh and posting flows
- [ ] confirm no required production secret is still only present in Apps Script

## 14. Cutover

- [ ] deploy Worker backend to staging
- [ ] run final staging smoke tests
- [ ] take a fresh production data export before cutover
- [ ] import the latest snapshot into production D1
- [ ] point frontend to the Worker API
- [ ] monitor errors and latency during first production traffic
- [ ] keep rollback path available until confidence is established

## 15. Post-cutover cleanup

- [ ] disable writes to Google Sheets as primary storage
- [ ] confirm no production endpoint still depends on Apps Script for core reads/writes
- [ ] remove dead code related to sheet scans
- [ ] remove obsolete script properties and secrets
- [ ] remove or reduce Apps Script to maintenance-only usage
- [ ] document the new production architecture

## 16. Rollback checklist

- [ ] keep the old Apps Script deployment available during the transition
- [ ] preserve current frontend environment config for quick reversion
- [ ] keep a recent sheet export before each migration step
- [ ] define who can revert production routing quickly
- [ ] define how data divergence is handled if writes occurred after cutover

## 17. Nice-to-have follow-ups

- [ ] add an architecture diagram for the Cloudflare target
- [ ] add automated data validation scripts between export and import
- [ ] add endpoint parity tests between Apps Script and Workers
- [ ] add seed fixtures for local Worker development
- [ ] add operational dashboards or structured logging for the new stack
