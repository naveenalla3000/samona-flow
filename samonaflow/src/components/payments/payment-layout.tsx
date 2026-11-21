import Link from "next/link";
import type { ReactNode } from "react";
import type { PaymentStatusValue } from "@/types/payment";

export function PaymentsHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

export function NoBusinessState() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Payments</h1>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
        <h2 className="text-lg font-medium">No business set up yet</h2>
        <p className="mt-2 text-sm text-neutral-500">Create a business before recording payments.</p>
      </div>
    </main>
  );
}

export function PaymentLoadError() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Payments</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        We couldn&apos;t load payments right now. Please try again.
      </div>
    </main>
  );
}

const STATUS_STYLES: Record<PaymentStatusValue, string> = {
  RECORDED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  REVERSED: "bg-neutral-200 text-neutral-600 line-through dark:bg-neutral-800 dark:text-neutral-400",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatusValue }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status === "REVERSED" ? "Reversed" : "Recorded"}
    </span>
  );
}

export const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};
