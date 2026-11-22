import Link from "next/link";
import type { ReactNode } from "react";
import type { ExpenseStatusValue } from "@/types/expense";

export function ExpensesHeader({
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
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <h2 className="text-lg font-medium">No business set up yet</h2>
        <p className="mt-2 text-sm text-neutral-500">Create a business before recording expenses.</p>
        <Link href="/onboarding" className="mt-4 inline-flex rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Set up business</Link>
      </div>
    </main>
  );
}

export function ExpenseLoadError() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        We couldn&apos;t load expenses right now. Please try again.
      </div>
    </main>
  );
}

const STATUS_STYLES: Record<ExpenseStatusValue, string> = {
  UPCOMING: "bg-sky-100 text-sky-800",
  OVERDUE: "bg-amber-100 text-amber-900",
  PAID: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-neutral-200 text-neutral-600 line-through",
};

const STATUS_LABELS: Record<ExpenseStatusValue, string> = {
  UPCOMING: "Upcoming",
  OVERDUE: "Overdue",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatusValue }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
