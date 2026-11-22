"use server";

// Server Actions for business onboarding, switching and settings. Identity is
// always resolved from the verified session; a business id supplied by the
// browser is validated and checked against a membership before it is used.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  businessIdSchema,
  createBusinessSchema,
  updateBusinessSchema,
} from "@/lib/validations/business";
import { setActiveBusinessId } from "@/server/auth/active-business";
import { requireUser } from "@/server/auth/require-auth";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { prismaBusinessMembershipRepository } from "@/server/repositories/business-membership-repository";
import { BusinessServiceError, businessService } from "@/server/services/business-service";
import { zodFieldErrors } from "@/server/utils/api-response";
import type { BusinessFormState } from "@/types/business-form";

function formDataToInput(formData: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

function actionError(error: unknown): BusinessFormState {
  if (error instanceof BusinessServiceError) {
    switch (error.code) {
      case "CURRENCY_LOCKED":
        return { status: "error", message: error.message, fieldErrors: { currency: error.message } };
      case "NOT_OWNER":
        return { status: "error", message: error.message };
      case "BUSINESS_FORBIDDEN":
        return { status: "error", message: "You do not have access to this business." };
      case "BUSINESS_NOT_FOUND":
        return { status: "error", message: "This business no longer exists." };
    }
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

export async function createBusinessAction(
  _previous: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const user = await requireUser();

  const parsed = createBusinessSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  let businessId: string;
  try {
    const business = await businessService.create(user, parsed.data);
    businessId = business.id;
  } catch (error) {
    return actionError(error);
  }

  await setActiveBusinessId(businessId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function updateBusinessAction(
  _previous: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const user = await requireUser();
  const current = await resolveCurrentBusiness(user);
  if (!current.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsed = updateBusinessSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  try {
    await businessService.update(user, current.businessId, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  return { status: "success", message: "Business settings saved." };
}

/** Set the active business after re-verifying membership. */
export async function switchBusinessAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = businessIdSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) return;

  const membership = await prismaBusinessMembershipRepository.findMembership(
    user.id,
    parsed.data,
  );
  if (!membership) return;

  await setActiveBusinessId(membership.businessId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
