interface ImportMetaEnv {
  /** Base URL of the deployed API, e.g. https://example.execute-api.ap-south-1.amazonaws.com. Unset means sample data. */
  readonly VITE_API_URL?: string;
  /** True while running the dev server. */
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
