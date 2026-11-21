"use server";

// Server Actions backing the Invoice UI. Identity and businessId are always
// resolved server-side; the same authorization service used by the REST API
// guards every mutation, and all totals are recalculated there.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createInvoiceSchema,
  invoiceIdSchema,
  updateInvoiceSchema,
} from "@/lib/validations/invoice";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { InvoiceServiceError, invoiceService } from "@/server/services/invoice-service";
import type { InvoiceFormState } from "@/types/invoice-form";

const LIST_PATH = "/dashboard/invoices";

type FieldIssues = { path: PropertyKey[]; message: string }[];

function fieldErrors(issues: FieldIssues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Reconstruct the nested items array from RHF's `items.0.quantity` field names. */
function formDataToInput(formData: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const rows: Record<string, string>[] = [];

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const match = key.match(/^items\.(\d+)\.(description|quantity|unitPrice)$/);
    if (match?.[1] && match[2]) {
      const index = Number(match[1]);
      rows[index] ??= {};
      rows[index][match[2]] = value;
      continue;
    }
    input[key] = value;
  }

  const items = rows.filter((row): row is Record<string, string> => Boolean(row));
  if (items.length > 0) input.items = items;
  if (input.currency === "") delete input.currency;
  return input;
}

function actionError(error: unknown): InvoiceFormState {
  if (error instanceof InvoiceServiceError) {
    if (error.code === "BUSINESS_FORBIDDEN") {
      return { status: "error", message: "You do not have access to this business." };
    }
    if (error.code === "CUSTOMER_NOT_FOUND") {
      return { status: "error", message: "This customer is no longer in your business." };
    }
    if (error.code === "INVOICE_LOCKED" || error.code === "INVALID_TRANSITION") {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

async function currentBusiness() {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  return { user, business };
}

export async function createInvoiceAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsed = createInvoiceSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  let invoiceId: string;
  try {
    const invoice = await invoiceService.create(user, business.businessId, parsed.data);
    invoiceId = invoice.id;
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${invoiceId}`);
}

export async function updateInvoiceAction(
  invoiceId: string,
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = invoiceIdSchema.safeParse(invoiceId);
  if (!parsedId.success) return { status: "error", message: "Invalid invoice." };

  const parsed = updateInvoiceSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  try {
    await invoiceService.update(user, business.businessId, parsedId.data, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

export async function sendInvoiceAction(formData: FormData): Promise<void> {
  const { user, business } = await currentBusiness();
  if (!business.ok) return;

  const parsedId = invoiceIdSchema.safeParse(formData.get("invoiceId"));
  if (!parsedId.success) return;

  try {
    await invoiceService.send(user, business.businessId, parsedId.data);
  } catch {
    return;
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const { user, business } = await currentBusiness();
  if (!business.ok) return;

  const parsedId = invoiceIdSchema.safeParse(formData.get("invoiceId"));
  if (!parsedId.success) return;

  try {
    await invoiceService.void(user, business.businessId, parsedId.data);
  } catch {
    return;
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}
