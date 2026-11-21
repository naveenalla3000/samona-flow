"use server";

// Server Actions backing the Expense UI. Identity and businessId are always
// resolved server-side; the same authorization service used by the REST API
// guards every mutation, and all derived fields are recomputed there.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createExpenseSchema,
  expenseIdSchema,
  payExpenseSchema,
  updateExpenseSchema,
} from "@/lib/validations/expense";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { ExpenseServiceError, expenseService } from "@/server/services/expense-service";
import { zodFieldErrors } from "@/server/utils/api-response";
import type { ExpenseFormState } from "@/types/expense-form";

const LIST_PATH = "/dashboard/expenses";

function formDataToInput(formData: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

function actionError(error: unknown): ExpenseFormState {
  if (error instanceof ExpenseServiceError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

async function currentBusiness() {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  return { user, business };
}

export async function createExpenseAction(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsed = createExpenseSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  let expenseId: string;
  try {
    const expense = await expenseService.create(user, business.businessId, parsed.data);
    expenseId = expense.id;
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${expenseId}`);
}

export async function updateExpenseAction(
  expenseId: string,
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = expenseIdSchema.safeParse(expenseId);
  if (!parsedId.success) return { status: "error", message: "Invalid expense." };

  const parsed = updateExpenseSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  try {
    await expenseService.update(user, business.businessId, parsedId.data, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

export async function markExpensePaidAction(
  expenseId: string,
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = expenseIdSchema.safeParse(expenseId);
  if (!parsedId.success) return { status: "error", message: "Invalid expense." };

  const parsed = payExpenseSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  try {
    await expenseService.markPaid(user, business.businessId, parsedId.data, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

export async function cancelExpenseAction(formData: FormData): Promise<void> {
  const { user, business } = await currentBusiness();
  if (!business.ok) return;

  const parsedId = expenseIdSchema.safeParse(formData.get("expenseId"));
  if (!parsedId.success) return;

  try {
    await expenseService.cancel(user, business.businessId, parsedId.data);
  } catch {
    // The record is simply not accessible or no longer cancellable in this
    // business; do not surface details about another tenant's data.
    return;
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(LIST_PATH);
}
