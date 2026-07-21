CREATE TABLE IF NOT EXISTS users (
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

CREATE INDEX IF NOT EXISTS idx_users_pseudo ON users(pseudo);
CREATE INDEX IF NOT EXISTS idx_users_famileo_email ON users(famileo_email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS articles (
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

CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
CREATE INDEX IF NOT EXISTS idx_articles_auteur ON articles(auteur);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_famileo_post_id ON articles(famileo_post_id);
CREATE INDEX IF NOT EXISTS idx_articles_famileo_fingerprint ON articles(famileo_fingerprint);
CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, date DESC);

CREATE TABLE IF NOT EXISTS jobs_pdf (
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

CREATE INDEX IF NOT EXISTS idx_jobs_pdf_status_created_at ON jobs_pdf(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_pdf_created_by ON jobs_pdf(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_pdf_date_range ON jobs_pdf(date_from, date_to);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  famileo_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_families_name ON families(name);

CREATE TABLE IF NOT EXISTS famileo_sessions (
  famileo_email TEXT PRIMARY KEY,
  phpsessid TEXT,
  rememberme TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_famileo_sessions_updated_at ON famileo_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS famileo_imports (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  fingerprint TEXT,
  article_id TEXT,
  imported_at TEXT NOT NULL,
  FOREIGN KEY(article_id) REFERENCES articles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_famileo_imports_post_id ON famileo_imports(post_id);
CREATE INDEX IF NOT EXISTS idx_famileo_imports_fingerprint ON famileo_imports(fingerprint);
CREATE INDEX IF NOT EXISTS idx_famileo_imports_article_id ON famileo_imports(article_id);

CREATE TABLE IF NOT EXISTS app_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_logs_category_created_at ON app_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_created_at ON app_logs(level, created_at DESC);
