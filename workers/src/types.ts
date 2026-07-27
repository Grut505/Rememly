export interface Env {
  DB: D1Database
  FILES: R2Bucket
  APP_ENV: string
  AUTH_SECRET?: string
  FAMILEO_PW_KEY?: string
  GITHUB_TRIGGER_TOKEN?: string
  GITHUB_TOKEN?: string
}

export interface AppContext {
  requestId: string
  env: Env
}
