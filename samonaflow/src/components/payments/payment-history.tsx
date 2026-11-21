import Link from "next/link";
import { METHOD_LABELS, PaymentStatusBadge } from "./payment-layout";
import type { PaymentRecord } from "@/types/payment";

export function PaymentHistory({
  payments,
  emptyMessage = "No payments recorded yet.",
}: {
  payments: PaymentRecord[];
  emptyMessage?: string;
}) {
  if (payments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Date</th>
            <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
            <th scope="col" className="px-4 py-3 font-medium">Customer</th>
            <th scope="col" className="px-4 py-3 font-medium">Method</th>
            <th scope="col" className="px-4 py-3 font-medium">Reference</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td className="px-4 py-3 tabular-nums">{payment.paymentDate}</td>
              <td className="px-4 py-3 font-medium">{payment.invoiceNumber}</td>
              <td className="px-4 py-3">{payment.customerName}</td>
              <td className="px-4 py-3">{METHOD_LABELS[payment.method]}</td>
              <td className="px-4 py-3 text-neutral-500">{payment.transactionReference ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={payment.status === "REVERSED" ? "line-through text-neutral-400" : ""}>
                  {payment.currency} {payment.amount}
                </span>
                {payment.status === "REVERSED" ? (
                  <span className="ml-2 text-xs text-neutral-500">effective 0.00</span>
                ) : null}
              </td>
              <td className="px-4 py-3"><PaymentStatusBadge status={payment.status} /></td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/payments/${payment.id}`}
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
