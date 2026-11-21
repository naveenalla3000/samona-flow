"use server";

// Server Actions backing the Reminder UI. Identity and businessId are always
// resolved server-side; the same authorization service used by the REST API
// guards every mutation. No delivery is attempted here — the WhatsApp action
// records that the owner opened a click-to-chat link, not that it was sent.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createReminderSchema,
  reminderIdSchema,
  updateReminderSchema,
} from "@/lib/validations/reminder";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { ReminderServiceError, reminderService } from "@/server/services/reminder-service";
import { zodFieldErrors } from "@/server/utils/api-response";
import type { ReminderFormState } from "@/types/reminder-form";

const LIST_PATH = "/dashboard/reminders";

function formDataToInput(formData: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

function actionError(error: unknown): ReminderFormState {
  if (error instanceof ReminderServiceError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

async function currentBusiness() {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  return { user, business };
}

export async function createReminderAction(
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsed = createReminderSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  let reminderId: string;
  try {
    const reminder = await reminderService.create(user, business.businessId, parsed.data);
    reminderId = reminder.id;
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${reminderId}`);
}

export async function updateReminderAction(
  reminderId: string,
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = reminderIdSchema.safeParse(reminderId);
  if (!parsedId.success) return { status: "error", message: "Invalid reminder." };

  const parsed = updateReminderSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  try {
    await reminderService.update(user, business.businessId, parsedId.data, parsed.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

/** Records a WhatsApp link open. Never asserts that a message was delivered. */
export async function recordWhatsappOpenedAction(reminderId: string): Promise<void> {
  const { user, business } = await currentBusiness();
  if (!business.ok) return;

  const parsedId = reminderIdSchema.safeParse(reminderId);
  if (!parsedId.success) return;

  try {
    await reminderService.markWhatsappOpened(user, business.businessId, parsedId.data);
  } catch {
    // An inaccessible or already-sent record is not an error the UI can fix.
    return;
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
}

export async function markReminderSentAction(
  reminderId: string,
  previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  // Required by useActionState; this action is intentionally form-only.
  void previous;
  void formData;

  const { user, business } = await currentBusiness();
  if (!business.ok) {
    return { status: "error", message: "No business is associated with your account yet." };
  }

  const parsedId = reminderIdSchema.safeParse(reminderId);
  if (!parsedId.success) return { status: "error", message: "Invalid reminder." };

  try {
    await reminderService.markSent(user, business.businessId, parsedId.data);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  redirect(`${LIST_PATH}/${parsedId.data}`);
}
