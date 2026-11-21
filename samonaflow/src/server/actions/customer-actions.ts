"use server";

// Server Actions backing the Customer UI. Identity and businessId are always
// resolved server-side; the same authorization service used by the REST API
// guards every mutation here.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomerSchema,
  customerIdSchema,
  updateCustomerSchema,
} from "@/lib/validations/customer";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { CustomerServiceError, customerService } from "@/server/services/customer-service";
import { zodFieldErrors } from "@/server/utils/api-response";
import type { CustomerFormState } from "@/types/customer-form";

const LIST_PATH = "/dashboard/customers";

function formDataToInput(formData: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

function actionError(error: unknown): CustomerFormState {
  if (error instanceof CustomerServiceError) {
    return {
      status: "error",
      message:
        error.code === "BUSINESS_FORBIDDEN"
          ? "You do not have access to this business."
          : "This customer no longer exists in your business.",
    };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

export async function createCustomerAction(
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsed = createCustomerSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  let customerId: string;
  try {
    const customer = await customerService.create(user, business.businessId, parsed.data);
    customerId = customer.id;
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${customerId}`);
}

export async function updateCustomerAction(
  customerId: string,
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = customerIdSchema.safeParse(customerId);
  if (!parsedId.success) return { status: "error", message: "Invalid customer." };

  const parsed = updateCustomerSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  try {
    await customerService.update(user, business.businessId, parsedId.data, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

export async function archiveCustomerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return;

  const parsedId = customerIdSchema.safeParse(formData.get("customerId"));
  if (!parsedId.success) return;

  try {
    await customerService.archive(user, business.businessId, parsedId.data);
  } catch {
    // The record is simply not accessible in this business; do not surface
    // details about another tenant's data.
    return;
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
