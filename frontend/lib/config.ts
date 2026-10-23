/**
 * Backend base URL. Defaults to the address the app has always used, so the
 * API contract and local setup are unchanged. Override with
 * NEXT_PUBLIC_API_URL (e.g. in .env.local) when deploying.
 */
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
