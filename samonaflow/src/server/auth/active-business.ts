// Server-only active-business selection. The cookie contains only a business
// id; it is never trusted on its own. Every read re-verifies a BusinessMembership
// for the signed-in user before the id is used.
import { cookies } from "next/headers";

export const ACTIVE_BUSINESS_COOKIE = "samonaflow_active_business";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function getActiveBusinessId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_BUSINESS_COOKIE)?.value ?? null;
}

export async function setActiveBusinessId(businessId: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: ACTIVE_BUSINESS_COOKIE,
    value: businessId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}

export async function clearActiveBusinessId(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_BUSINESS_COOKIE);
}
