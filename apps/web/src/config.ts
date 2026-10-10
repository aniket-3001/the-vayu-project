/**
 * Where the app finds our API on AWS. Set `VITE_API_URL` when building for another stack; this default is the
 * deployed one. No trailing slash.
 */
export const API_URL: string = (
  import.meta.env.VITE_API_URL ?? 'https://niu33luxo8.execute-api.ap-south-1.amazonaws.com'
).replace(/\/+$/u, '');
