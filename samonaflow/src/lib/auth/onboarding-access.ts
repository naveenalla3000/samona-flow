/**
 * The onboarding page is the first-business flow by default. A user who already
 * belongs to a business may still open it explicitly to add another workspace.
 * This keeps the normal onboarding guard intact without removing multi-business
 * creation from the product.
 */
export function canAccessOnboarding(
  hasBusiness: boolean,
  addBusiness: string | null | undefined,
): boolean {
  return !hasBusiness || addBusiness === "1";
}
