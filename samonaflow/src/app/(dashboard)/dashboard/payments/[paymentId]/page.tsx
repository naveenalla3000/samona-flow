import Link from "next/link";
import { notFound } from "next/navigation";
import { METHOD_LABELS, NoBusinessState, PaymentStatusBadge, PaymentsHeader } from "@/components/payments/payment-layout";
import { ReversalForm } from "@/components/payments/reversal-form";
import { canReversePayment } from "@/lib/payment-status";
import { paymentIdSchema } from "@/lib/validations/payment";
import { reversePaymentAction } from "@/server/actions/payment-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { PaymentServiceError, paymentService } from "@/server/services/payment-service";
import type { PaymentDetail } from "@/types/payment";

export const instant = false;

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { paymentId: rawId } = await params;
  const parsedId = paymentIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let payment: PaymentDetail;
  try {
    payment = await paymentService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof PaymentServiceError && error.code === "PAYMENT_NOT_FOUND") notFound();
    throw error;
  }

  const canReverse = payment.status === "RECORDED" && canReversePayment(payment.invoice.status);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <PaymentsHeader
        title={`Payment for ${payment.invoiceNumber}`}
        subtitle={`Recorded ${payment.createdAt}`}
        action={
          <Link
            href={`/dashboard/invoices/${payment.invoiceId}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            View invoice
          </Link>
        }
      />

      <section aria-labelledby="payment-summary" className="mt-6 grid gap-3 sm:grid-cols-2">
        <h2 id="payment-summary" className="sr-only">Payment summary</h2>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Amount</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{payment.currency} {payment.amount}</p>
          <p className="mt-2"><PaymentStatusBadge status={payment.status} /></p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Payment details</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Date</dt><dd>{payment.paymentDate}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Method</dt><dd>{METHOD_LABELS[payment.method]}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Reference</dt><dd>{payment.transactionReference ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Customer</dt><dd>{payment.customerName}</dd></div>
          </dl>
        </div>
      </section>

      {payment.notes ? (
        <section aria-labelledby="payment-notes" className="mt-6">
          <h2 id="payment-notes" className="text-sm font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">{payment.notes}</p>
        </section>
      ) : null}

      <section aria-labelledby="invoice-balance" className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 id="invoice-balance" className="text-sm font-semibold">Invoice balance</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-neutral-500">Total</dt><dd className="tabular-nums">{payment.currency} {payment.invoice.totalAmount}</dd></div>
          <div><dt className="text-neutral-500">Effective paid</dt><dd className="tabular-nums">{payment.currency} {payment.invoice.amountPaid}</dd></div>
          <div><dt className="text-neutral-500">Outstanding</dt><dd className="tabular-nums">{payment.currency} {payment.invoice.outstandingAmount}</dd></div>
        </dl>
      </section>

      {payment.reversal ? (
        <section aria-labelledby="reversal-heading" className="mt-6 rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
          <h2 id="reversal-heading" className="text-sm font-semibold">Reversal record</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Reason</dt><dd>{payment.reversal.reason}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Reversed at</dt><dd>{payment.reversal.reversedAt}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Reversed by</dt><dd>{payment.reversal.reversedByEmail ?? payment.reversal.reversedById}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">This payment is excluded from effective paid totals. It cannot be reversed again.</p>
        </section>
      ) : canReverse ? (
        <ReversalForm
          amount={payment.amount}
          currency={payment.currency}
          action={reversePaymentAction.bind(null, payment.id)}
        />
      ) : (
        <p className="mt-6 text-sm text-neutral-500">
          {payment.status === "REVERSED"
            ? "This payment is already reversed."
            : "This payment cannot be reversed while its invoice is void or a draft."}
        </p>
      )}
    </main>
  );
}
