# Rememly Workers

Initial Cloudflare Workers skeleton for the future Rememly backend.

This is preparation-only for now. The current app should continue using the Google Apps Script backend until staging and migration validation are complete.

Staging guide:

- `docs/STAGING_WORKER_TESTING.md`

## What is included

- `wrangler.toml` with local, staging, and production placeholders
- D1 migration scaffold in `migrations/0001_initial.sql`
- R2 binding placeholder
- minimal Worker routes:
  - `GET /`
  - `GET /health`
  - Apps Script-compatible `?path=...` routing support
  - `auth/check`
  - `users/list`
  - `profile/get`
  - `profile/save`
  - `articles/list`
  - `articles/authors`
  - `articles/get`
  - `articles/create`
  - `articles/update`
  - `articles/delete`
  - `articles/permanent-delete`
  - `famileo/families`
  - `famileo/imported-ids`
  - `famileo/imported-fingerprints`

## Before first use

Replace placeholders in `wrangler.toml`:

- `REPLACE_WITH_LOCAL_OR_DEV_DATABASE_ID`
- `REPLACE_WITH_STAGING_DATABASE_ID`
- `REPLACE_WITH_PRODUCTION_DATABASE_ID`
- bucket names if needed

Copy local secrets if needed:

```bash
cp .dev.vars.example .dev.vars
```

## Install

```bash
cd workers
npm install
```

## Local development

```bash
cd workers
npm run db:migrate:local
npm run dev
```

Or from the repository root:

```bash
npm run workers:bootstrap:local
npm run workers:dev
```

## Apply migrations

Staging:

```bash
cd workers
npm run db:migrate:staging
```

Production:

```bash
cd workers
npm run db:migrate:production
```

## Deploy

```bash
cd workers
npm run deploy
```

## Recommended next implementation steps

1. add auth middleware and user lookup
2. migrate `users/list`, `profile/get`, and `articles/list` properly
3. add import/export scripts between Sheets and D1
4. move Famileo orchestration endpoints
5. move PDF job orchestration endpoints
