import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CopyReminderButton, ReminderActions } from "@/components/reminders/reminder-actions";
import {
  FollowUpIndicator,
  NoBusinessState,
  ReminderStatusBadge,
  RemindersHeader,
} from "@/components/reminders/reminder-layout";
import { REMINDER_TYPE_LABELS, canEditMessage, canReschedule } from "@/lib/reminder-status";
import { reminderIdSchema } from "@/lib/validations/reminder";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { ReminderServiceError, reminderService } from "@/server/services/reminder-service";
import type { ReminderDetail } from "@/types/reminder";

export const metadata = { title: "Reminder" };

export const instant = false;

export default async function ReminderDetailPage({
  params,
}: {
  params: Promise<{ reminderId: string }>;
}) {
  await connection();
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

  const editable = canEditMessage(reminder.status) || canReschedule(reminder.status);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <RemindersHeader
        title={`Reminder for ${reminder.customerName}`}
        subtitle={`${reminder.invoiceNumber} · ${REMINDER_TYPE_LABELS[reminder.reminderType]} · created ${reminder.createdAt}`}
        action={
          <Link
            href="/dashboard/reminders"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            All reminders
          </Link>
        }
      />

      <section aria-labelledby="reminder-summary" className="mt-6 grid gap-3 sm:grid-cols-2">
        <h2 id="reminder-summary" className="sr-only">Reminder summary</h2>
        <div className="rounded-lg border border-neutral-200 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Status</p>
          <p className="mt-2"><ReminderStatusBadge status={reminder.status} /></p>
          <p className="mt-2 text-sm">
            <FollowUpIndicator state={reminder.followUpState} date={reminder.followUpDate} />
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Opening WhatsApp is not delivery. Only you can confirm that a message was sent.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Invoice context</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Customer</dt><dd>{reminder.customerName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Invoice</dt>
              <dd><Link href={`/dashboard/invoices/${reminder.invoiceId}`} className="underline">{reminder.invoiceNumber}</Link></dd>
            </div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Invoice due</dt><dd>{reminder.invoiceDueDate}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Follow-up</dt><dd>{reminder.followUpDate ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Currency</dt><dd>{reminder.currency}</dd></div>
          </dl>
          {reminder.invoiceOverdue ? (
            <p className="mt-2 text-xs font-medium text-amber-700">The invoice is overdue.</p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="reminder-message" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reminder-message" className="text-sm font-semibold">Generated message</h2>
          <CopyReminderButton message={reminder.message} />
        </div>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-4 text-sm leading-relaxed">
{reminder.message}
        </pre>
      </section>

      <div className="mt-6">
        <ReminderActions reminder={reminder} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {editable ? (
          <Link
            href={`/dashboard/reminders/${reminder.id}/edit`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            {canEditMessage(reminder.status) ? "Edit reminder" : "Reschedule follow-up"}
          </Link>
        ) : null}
        <Link
          href={`/dashboard/customers/${reminder.customerId}`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          Customer profile
        </Link>
      </div>

      {reminder.status === "MARKED_SENT" ? (
        <p className="mt-6 text-sm text-neutral-500">
          This reminder is kept as history and can no longer be edited, rescheduled or sent again.
        </p>
      ) : null}
    </main>
  );
}
