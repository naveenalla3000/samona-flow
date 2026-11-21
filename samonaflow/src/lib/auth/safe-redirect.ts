export const DEFAULT_AUTH_REDIRECT = "/dashboard";

const MAX_NEXT_PATH_LENGTH = 2048;

// ASCII control characters (0-31) and DEL (127).
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * Returns a safe, same-origin path for post-auth redirects.
 *
 * Prevents open redirects: anything that is not a plain relative path
 * (absolute URLs, protocol-relative `//host` or `/\host` forms, backslashes,
 * control characters, or overly long values) falls back to
 * DEFAULT_AUTH_REDIRECT. A valid input is returned unchanged; an absolute URL
 * is never returned.
 */
export function sanitizeNextPath(
  value: FormDataEntryValue | string | null | undefined,
): string {
  if (typeof value !== "string") {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (
    value.length === 0 ||
    value.length > MAX_NEXT_PATH_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    value.includes("\\") ||
    value.includes("://") ||
    CONTROL_CHAR_PATTERN.test(value)
  ) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return value;
}
