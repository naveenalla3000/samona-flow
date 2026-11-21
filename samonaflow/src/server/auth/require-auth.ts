// Server-only: use in Server Components and Route Handlers that require a session.
import { redirect } from "next/navigation";
import { getCurrentUser } from "./get-current-user";
import type { AuthenticatedUser } from "./auth-types";

/** Redirects unauthenticated visitors to /login; never trusts client state. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
