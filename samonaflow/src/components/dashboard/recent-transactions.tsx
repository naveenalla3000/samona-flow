import Link from "next/link";
import { parseSignedMoney } from "@/lib/invoice-math";
import type { DashboardTransaction } from "@/types/dashboard";
import { DashboardCard, DashboardEmpty, formatDashboardMoney, StatusBadge, type Tone } from "./dashboard-ui";

const TYPE_TONE: Record<DashboardTransaction["type"], Tone> = {
  PAYMENT: "positive",
  EXPENSE: "negative",
  INVOICE: "neutral",
};

export function RecentTransactions({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  return (
    <DashboardCard
      title="Recent transactions"
      subtitle="Actual money movements only · no generated entries"
      action={
        <Link href="/dashboard/payments" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
          All payments →
        </Link>
      }
    >
      {transactions.length === 0 ? (
        <DashboardEmpty
          title="No transactions yet"
          message="Recorded payments and paid expenses will appear here as real money movements."
          href="/dashboard/payments"
          linkLabel="View payments"
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {transactions.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={TYPE_TONE[item.type]}>{item.label}</StatusBadge>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{item.date}</span>
                </div>
                <Link href={item.href} className="mt-1 block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">
                  {item.description}
                </Link>
              </div>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${item.type === "PAYMENT" ? "text-positive dark:text-emerald-300" : "text-slate-800 dark:text-slate-100"}`}>
                {item.type === "PAYMENT" ? "+" : "−"}
                {formatDashboardMoney(parseSignedMoney(item.amount), item.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
