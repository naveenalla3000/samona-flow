import Link from "next/link";
import { REMINDER_TYPE_LABELS } from "@/lib/reminder-status";
import type { ReminderRecord } from "@/types/reminder";
import { FollowUpIndicator, ReminderStatusBadge } from "./reminder-layout";

export function ReminderList({
  reminders,
  emptyMessage = "No reminders match these filters.",
}: {
  reminders: ReminderRecord[];
  emptyMessage?: string;
}) {
  if (reminders.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Customer / invoice</th>
            <th scope="col" className="px-4 py-3 font-medium">Category</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Follow-up</th>
            <th scope="col" className="px-4 py-3 font-medium">Invoice due</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {reminders.map((reminder) => (
            <tr key={reminder.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{reminder.customerName}</p>
                <p className="text-xs text-neutral-500">{reminder.invoiceNumber}</p>
              </td>
              <td className="px-4 py-3 text-neutral-500">{REMINDER_TYPE_LABELS[reminder.reminderType]}</td>
              <td className="px-4 py-3"><ReminderStatusBadge status={reminder.status} /></td>
              <td className="px-4 py-3">
                <FollowUpIndicator state={reminder.followUpState} date={reminder.followUpDate} />
              </td>
              <td className="px-4 py-3 tabular-nums">
                {reminder.invoiceDueDate}
                {reminder.invoiceOverdue ? (
                  <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-400">overdue</span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/reminders/${reminder.id}`}
                  className="text-sm text-neutral-600 underline hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
