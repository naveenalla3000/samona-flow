import Link from "next/link";
import type { ReactNode } from "react";
import type { ReminderFollowUpState, ReminderStatusValue } from "@/types/reminder";

export function RemindersHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

export function NoBusinessState() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold">Reminders</h1>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <h2 className="text-lg font-medium">No business set up yet</h2>
        <p className="mt-2 text-sm text-neutral-500">Create your business workspace to start generating reminders.</p>
        <Link href="/onboarding" className="mt-4 inline-flex rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Set up business</Link>
      </div>
    </main>
  );
}

export function ReminderLoadError() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold">Reminders</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        We couldn&apos;t load reminders right now. Please try again.
      </div>
    </main>
  );
}

const STATUS_STYLES: Record<ReminderStatusValue, string> = {
  DRAFTED: "bg-sky-100 text-sky-800",
  WHATSAPP_OPENED: "bg-violet-100 text-violet-800",
  MARKED_SENT: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABELS: Record<ReminderStatusValue, string> = {
  DRAFTED: "Draft generated",
  WHATSAPP_OPENED: "WhatsApp opened",
  MARKED_SENT: "Marked sent",
};

export function ReminderStatusBadge({ status }: { status: ReminderStatusValue }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const FOLLOW_UP_STYLES: Record<ReminderFollowUpState, string> = {
  NONE: "text-neutral-500",
  OVERDUE: "text-amber-700",
  DUE_TODAY: "text-amber-700",
  UPCOMING: "text-sky-700",
};

const FOLLOW_UP_LABELS: Record<ReminderFollowUpState, string> = {
  NONE: "No follow-up due",
  OVERDUE: "Follow-up overdue",
  DUE_TODAY: "Follow-up due today",
  UPCOMING: "Follow-up upcoming",
};

export function FollowUpIndicator({ state, date }: { state: ReminderFollowUpState; date: string | null }) {
  return (
    <span className={`text-xs font-medium ${FOLLOW_UP_STYLES[state]}`}>
      {FOLLOW_UP_LABELS[state]}
      {date ? ` · ${date}` : ""}
    </span>
  );
}
