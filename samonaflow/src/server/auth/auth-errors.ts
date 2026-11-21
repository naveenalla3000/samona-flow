// Maps Supabase Auth error messages to stable, user-facing text. Raw provider
// messages and tokens are never logged or returned to the browser.
const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  "Invalid login credentials": "Invalid email or password.",
  "Email not confirmed": "Please verify your email address before signing in.",
  "User already registered": "An account with this email already exists.",
  "Password should be at least 6 characters": "Password must be at least 8 characters.",
  "Unable to validate email address: invalid format": "Enter a valid email address.",
  "Signup is disabled": "New registrations are currently disabled.",
  "For security purposes, you can only request this after":
    "Too many attempts. Please wait a moment and try again.",
};

export function mapAuthError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;

  for (const [needle, replacement] of Object.entries(AUTH_ERROR_MESSAGES)) {
    if (message.includes(needle)) return replacement;
  }

  return fallback;
}
