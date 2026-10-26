interface ImportMetaEnv {
  /** Base URL of the deployed API, e.g. https://example.execute-api.ap-south-1.amazonaws.com. Unset uses the deployed one. */
  readonly VITE_API_URL?: string;
  /** Base URL of the deployed assistant (Bedrock and Polly behind our API). Unset means local answers. */
  readonly VITE_ASSISTANT_URL?: string;
  /** "true" only in the build for the Android and iOS apps; unset for the website. */
  readonly VITE_NATIVE?: string;
  /** The build mode: development, production, or test. */
  readonly MODE: string;
  /** True while running the dev server. */
  readonly DEV: boolean;
}

/** Set by vite.config.ts at build time; not defined where the app runs without Vite (some tests). */
declare const __BUILD__: { readonly commit: string; readonly date: string } | undefined;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** A worker bundled by Vite, imported as the URL it is served from. */
declare module '*?worker&url' {
  const url: string;
  export default url;
}
