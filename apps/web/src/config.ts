/**
 * Where the app finds our API on AWS. The deployed site is built with `VITE_API_URL=` (empty), so the API is the
 * same address as the page, under `/v1`. For development it falls back to the API's own address. No trailing slash.
 */
export const API_URL: string = (
  import.meta.env.VITE_API_URL ?? 'https://d3lmq1mze2gup3.cloudfront.net'
).replace(/\/+$/u, '');
