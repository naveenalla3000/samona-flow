import Link from "next/link";
import type { DashboardTransaction } from "@/types/dashboard";
import {
  DashboardSection,
  EmptyState,
  formatMajor,
  InlineLink,
  SectionError,
} from "./dashboard-ui";

const KIND_LABELS: Record<DashboardTransaction["kind"], string> = {
  PAYMENT: "Payment",
  EXPENSE: "Expense",
};

export function RecentTransactionsPanel({
  items,
  currency,
  error = false,
}: {
  items: DashboardTransaction[];
  currency: string;
  error?: boolean;
}) {
  return (
    <DashboardSection
      id="recent-transactions"
      title="Recent transactions"
      description="Recorded customer payments and paid expenses only. Reversed payments are excluded."
      action={<InlineLink href="/dashboard/payments">All payments</InlineLink>}
    >
      {error ? (
        <SectionError message="Recent transactions could not be loaded. Refresh the page to try again." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Recorded payments and paid expenses will appear here. Draft invoices and unpaid expenses are not transactions."
          action={<InlineLink href="/dashboard/payments">Record a payment</InlineLink>}
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.kind === "PAYMENT"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {KIND_LABELS[item.kind]}
                  </span>
                  <span className="text-xs tabular-nums text-slate-500">{item.date}</span>
                </div>
                <Link
                  href={item.href}
                  className="mt-1 block truncate text-sm font-medium text-slate-900 hover:underline"
                >
                  {item.description}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {item.reference ? `Invoice ${item.reference}` : "Operating expense"}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  item.direction === "in" ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {item.direction === "in" ? "+" : "−"}
                {formatMajor(item.amount, item.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">Amounts are shown in {currency}.</span>
    </DashboardSection>
  );
}
