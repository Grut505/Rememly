CREATE TABLE IF NOT EXISTS pdf_previews (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PENDING',
  options_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  r2_key TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
