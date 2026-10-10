interface ImportMetaEnv {
  /** Base URL of the deployed API, e.g. https://example.execute-api.ap-south-1.amazonaws.com. Unset uses the deployed one. */
  readonly VITE_API_URL?: string;
  /** Base URL of the deployed assistant (Bedrock and Polly behind our API). Unset means local answers. */
  readonly VITE_ASSISTANT_URL?: string;
  /** `1` only in the prototype build (device frames, scenarios). Never set for the deployed app. */
  readonly VITE_DEMO?: string;
  /** The build mode: development, production, or test. */
  readonly MODE: string;
  /** True while running the dev server. */
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** A worker bundled by Vite, imported as the URL it is served from. */
declare module '*?worker&url' {
  const url: string;
  export default url;
}
