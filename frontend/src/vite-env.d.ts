/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_APPS_SCRIPT_URL: string
  readonly VITE_SPREADSHEET_URL?: string
  readonly VITE_APP_VERSION: string
  readonly VITE_BACKEND_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
