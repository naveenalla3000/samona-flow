import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
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
      description={`Recorded customer payments and paid expenses only. Reversed payments are excluded. Amounts in ${currency}.`}
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
        <ul className="divide-y divide-zinc-100">
          {items.map((item) => {
            const incoming = item.direction === "in";
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                    incoming ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  }`}
                  aria-hidden="true"
                >
                  {incoming ? (
                    <ArrowDownLeft className="size-4" />
                  ) : (
                    <ArrowUpRight className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        incoming
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {KIND_LABELS[item.kind]}
                    </span>
                    <span className="text-[10px] tabular-nums text-zinc-400">{item.date}</span>
                  </div>
                  <Link
                    href={item.href}
                    className="mt-1 block truncate text-sm font-medium text-zinc-900 hover:underline"
                  >
                    {item.description}
                  </Link>
                  <p className="truncate text-[11px] text-zinc-500">
                    {item.reference ? `Invoice ${item.reference}` : "Operating expense"}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    incoming ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {incoming ? "+" : "−"}
                  {formatMajor(item.amount, item.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardSection>
  );
}
