"use server";

// Server Actions backing the Payment UI. Identity and businessId are always
// resolved server-side; the same authorization service used by the REST API
// guards every mutation, and all balances/statuses are recalculated there.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createPaymentSchema,
  paymentIdSchema,
  reversePaymentSchema,
} from "@/lib/validations/payment";
import { invoiceIdSchema } from "@/lib/validations/invoice";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { PaymentServiceError, paymentService } from "@/server/services/payment-service";
import type { PaymentFormState } from "@/types/payment-form";

const INVOICE_LIST_PATH = "/dashboard/invoices";
const PAYMENT_LIST_PATH = "/dashboard/payments";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function actionError(error: unknown): PaymentFormState {
  if (error instanceof PaymentServiceError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

async function currentBusiness() {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  return { user, business };
}

export async function recordPaymentAction(
  invoiceId: string,
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = invoiceIdSchema.safeParse(invoiceId);
  if (!parsedId.success) return { status: "error", message: "Invalid invoice." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = createPaymentSchema.safeParse({ ...raw, invoiceId: parsedId.data });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  try {
    await paymentService.create(user, business.businessId, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(INVOICE_LIST_PATH);
  revalidatePath(`${INVOICE_LIST_PATH}/${parsedId.data}`);
  revalidatePath(PAYMENT_LIST_PATH);
  redirect(`${INVOICE_LIST_PATH}/${parsedId.data}`);
}

export async function reversePaymentAction(
  paymentId: string,
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = paymentIdSchema.safeParse(paymentId);
  if (!parsedId.success) return { status: "error", message: "Invalid payment." };

  const parsed = reversePaymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  let invoiceId: string;
  try {
    const payment = await paymentService.reverse(
      user,
      business.businessId,
      parsedId.data,
      parsed.data,
    );
    invoiceId = payment.invoiceId;
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(INVOICE_LIST_PATH);
  revalidatePath(`${INVOICE_LIST_PATH}/${invoiceId}`);
  revalidatePath(PAYMENT_LIST_PATH);
  revalidatePath(`${PAYMENT_LIST_PATH}/${parsedId.data}`);
  redirect(`${PAYMENT_LIST_PATH}/${parsedId.data}`);
}
