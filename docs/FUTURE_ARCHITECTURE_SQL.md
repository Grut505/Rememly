# Future Architecture SQL Draft

This document provides a first-pass D1 schema draft for a future migration from Google Sheets / Apps Script to Cloudflare Workers + D1 + R2.

It is intentionally pragmatic rather than perfect. The goal is to preserve the current application behavior and mixed English/French domain vocabulary while replacing sheet-based storage with indexed SQL tables.

## Design goals

- keep current frontend contracts easy to preserve
- keep current domain field names where they already exist
- support fast pagination and lookups
- separate binary storage from relational data
- keep migration risk low by avoiding unnecessary renames

## Notes

- SQL below targets SQLite-style syntax compatible with D1
- timestamps are stored as ISO strings for portability and simplicity during migration
- booleans are stored as integer flags (`0` / `1`)
- JSON-like structured payloads are stored as text columns initially

## Tables

### `users`

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  pseudo TEXT,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  famileo_email TEXT,
  famileo_password_enc TEXT,
  is_declared_author INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_users_pseudo ON users(pseudo);
CREATE INDEX idx_users_famileo_email ON users(famileo_email);
CREATE INDEX idx_users_status ON users(status);
```

### `articles`

```sql
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  auteur TEXT,
  author_pseudo TEXT,
  texte TEXT,
  image_url TEXT,
  image_file_id TEXT,
  assembly_state_json TEXT,
  full_page INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  famileo_post_id TEXT,
  famileo_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_articles_date ON articles(date);
CREATE INDEX idx_articles_auteur ON articles(auteur);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_famileo_post_id ON articles(famileo_post_id);
CREATE INDEX idx_articles_famileo_fingerprint ON articles(famileo_fingerprint);
CREATE INDEX idx_articles_status_date ON articles(status, date DESC);
```

### `jobs_pdf`

```sql
CREATE TABLE jobs_pdf (
  job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT,
  pdf_file_id TEXT,
  pdf_url TEXT,
  chunks_folder_id TEXT,
  chunks_folder_url TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  created_by_pseudo TEXT,
  date_from TEXT,
  date_to TEXT,
  error_message TEXT
);

CREATE INDEX idx_jobs_pdf_status_created_at ON jobs_pdf(status, created_at DESC);
CREATE INDEX idx_jobs_pdf_created_by ON jobs_pdf(created_by);
CREATE INDEX idx_jobs_pdf_date_range ON jobs_pdf(date_from, date_to);
```

### `config`

```sql
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
```

Use this only for non-secret configuration. Secrets should live in Worker secrets.

### `famileo_sessions`

```sql
CREATE TABLE famileo_sessions (
  famileo_email TEXT PRIMARY KEY,
  phpsessid TEXT,
  rememberme TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX idx_famileo_sessions_updated_at ON famileo_sessions(updated_at DESC);
```

### `famileo_imports`

```sql
CREATE TABLE famileo_imports (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  fingerprint TEXT,
  article_id TEXT,
  imported_at TEXT NOT NULL,
  FOREIGN KEY(article_id) REFERENCES articles(id)
);

CREATE UNIQUE INDEX idx_famileo_imports_post_id ON famileo_imports(post_id);
CREATE INDEX idx_famileo_imports_fingerprint ON famileo_imports(fingerprint);
CREATE INDEX idx_famileo_imports_article_id ON famileo_imports(article_id);
```

### `families`

```sql
CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  famileo_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_families_name ON families(name);
```

### `app_logs`

```sql
CREATE TABLE app_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_app_logs_category_created_at ON app_logs(category, created_at DESC);
CREATE INDEX idx_app_logs_level_created_at ON app_logs(level, created_at DESC);
```

## Optional normalization for later

These are not required for the first migration wave, but may be useful later:

- separate `article_images` table if one article can own multiple images
- separate `roles` or `permissions` table if access control grows
- separate `pdf_artifacts` table if each job needs multiple files
- separate `audit_events` table if operational traceability becomes important

## Example migration notes by current data source

### Users sheet -> `users`

Preserve where possible:

- email as the main unique identifier
- pseudo and role/profile semantics
- Famileo-specific fields already used by the backend

### Articles sheet -> `articles`

Preserve where possible:

- `auteur`
- `texte`
- `image_url`
- `image_file_id`
- `famileo_post_id`
- any soft-delete semantics currently represented by `status`

### Config sheet / script properties -> split between `config` and Worker secrets

Put in `config`:

- non-sensitive feature toggles
- non-secret links and UI-related configuration
- operational settings that do not expose credentials

Put in Worker secrets:

- GitHub tokens
- Famileo encryption keys
- OAuth secrets
- callback tokens
- any long-lived credential material

## Query patterns this schema is meant to optimize

### Article list page

- filter by date range
- filter by author
- filter by status
- sort by date descending
- paginate before loading full result sets

### Famileo import checks

- lookup imported post by `post_id`
- lookup imported post by `fingerprint`

### PDF jobs

- list recent jobs
- filter active jobs by status
- lookup by `job_id`

### Auth and profile

- lookup user by email
- update pseudo/profile fields quickly

## Suggested future improvements after initial migration

- add FTS/search only if article search becomes a real need
- add materialized counters only if stats become expensive
- move operational logs to a dedicated logging provider if volume grows
- add background job tables if PDF or Famileo flows need more orchestration
