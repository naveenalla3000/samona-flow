import { notFound } from "next/navigation";
import {
  ReminderEditForm,
} from "@/components/reminders/reminder-form";
import {
  NoBusinessState,
  RemindersHeader,
} from "@/components/reminders/reminder-layout";
import { canEditMessage, canReschedule } from "@/lib/reminder-status";
import { reminderIdSchema } from "@/lib/validations/reminder";
import { updateReminderAction } from "@/server/actions/reminder-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { ReminderServiceError, reminderService } from "@/server/services/reminder-service";
import type { ReminderDetail } from "@/types/reminder";

export const instant = false;

export default async function EditReminderPage({
  params,
}: {
  params: Promise<{ reminderId: string }>;
}) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { reminderId: rawId } = await params;
  const parsedId = reminderIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let reminder: ReminderDetail;
  try {
    reminder = await reminderService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof ReminderServiceError && error.code === "REMINDER_NOT_FOUND") notFound();
    throw error;
  }
  if (!canEditMessage(reminder.status) && !canReschedule(reminder.status)) notFound();

  const allowEditMessage = canEditMessage(reminder.status);
  const updateAction = updateReminderAction.bind(null, reminder.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <RemindersHeader
        title={allowEditMessage ? "Edit reminder" : "Reschedule follow-up"}
        subtitle={`${reminder.invoiceNumber} · ${reminder.customerName}`}
      />
      <ReminderEditForm
        reminder={reminder}
        allowEditMessage={allowEditMessage}
        action={updateAction}
        cancelHref={`/dashboard/reminders/${reminder.id}`}
      />
    </main>
  );
}
