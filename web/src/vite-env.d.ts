/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEMO_DATA?: string
  readonly VITE_ROUTER?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
