export interface Env {
  DB: D1Database
  FILES: R2Bucket
  APP_ENV: string
  AUTH_SECRET?: string
  FAMILEO_PW_KEY?: string
  GITHUB_TRIGGER_TOKEN?: string
  GITHUB_TOKEN?: string
  PDF_MERGE_TOKEN?: string
  GDRIVE_CLIENT_ID?: string
  GDRIVE_CLIENT_SECRET?: string
  GDRIVE_REFRESH_TOKEN?: string
}

export interface AppContext {
  requestId: string
  env: Env
}
