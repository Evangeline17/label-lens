/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LABEL_RECOGNITION_BETA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
