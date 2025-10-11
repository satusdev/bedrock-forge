/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_GITHUB_CLIENT_ID: string
  readonly VITE_GOOGLE_DRIVE_CLIENT_ID: string
  readonly VITE_APP_ENV: 'development' | 'production'
  readonly VITE_ENABLE_ANALYTICS: string
  readonly more: any
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}