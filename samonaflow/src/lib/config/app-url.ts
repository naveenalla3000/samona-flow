// Server-only configuration helper. Do not import from client components.
const DEV_APP_URL = "http://localhost:3000";

/** Returns the application's own origin, used for absolute Supabase redirect URLs. */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const candidate = configured && configured.length > 0 ? configured : DEV_APP_URL;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be an absolute http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use http or https");
  }

  return url.origin;
}
