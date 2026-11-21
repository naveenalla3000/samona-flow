import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceActionButtons } from "@/components/invoices/invoice-actions";
import { InvoicesHeader, NoBusinessState, StatusBadge } from "@/components/invoices/invoice-layout";
import { PaymentForm } from "@/components/payments/payment-form";
import { PaymentHistory } from "@/components/payments/payment-history";
import { businessLocalDate } from "@/lib/business-date";
import { parseSignedMoney } from "@/lib/invoice-math";
import { canRecordPayment } from "@/lib/payment-status";
import { invoiceIdSchema } from "@/lib/validations/invoice";
import { listPaymentsQuerySchema } from "@/lib/validations/payment";
import { canSendInvoice, canVoidInvoice } from "@/lib/invoice-status";
import { sendInvoiceAction, voidInvoiceAction } from "@/server/actions/invoice-actions";
import { recordPaymentAction } from "@/server/actions/payment-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { InvoiceServiceError, invoiceService } from "@/server/services/invoice-service";
import { paymentService } from "@/server/services/payment-service";
import type { InvoiceDetail } from "@/types/invoice";

export const metadata = { title: "Invoice" };

export const instant = false;

const HISTORY_QUERY = listPaymentsQuerySchema.parse({ pageSize: 5 });

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { invoiceId: rawId } = await params;
  const parsedId = invoiceIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let invoice: InvoiceDetail;
  try {
    invoice = await invoiceService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof InvoiceServiceError && error.code === "INVOICE_NOT_FOUND") notFound();
    throw error;
  }

  let payments;
  try {
    payments = await paymentService.listForInvoice(
      user,
      business.businessId,
      invoice.id,
      HISTORY_QUERY,
    );
  } catch {
    payments = null;
  }
  const hasBalance = parseSignedMoney(invoice.outstandingAmount) > BigInt(0);
  const showPaymentForm = canRecordPayment(invoice.status) && hasBalance;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <InvoicesHeader
        title={invoice.invoiceNumber}
        subtitle={`Issued ${invoice.issueDate} · Due ${invoice.dueDate}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/dashboard/invoices/${invoice.id}/preview`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Preview / print
            </Link>
            {hasBalance && ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) ? (
              <Link
                href={`/dashboard/reminders/new?invoiceId=${encodeURIComponent(invoice.id)}`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Generate reminder
              </Link>
            ) : null}
            {invoice.isEditable ? (
              <Link
                href={`/dashboard/invoices/${invoice.id}/edit`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Edit draft
              </Link>
            ) : null}
            <InvoiceActionButtons
              invoiceId={invoice.id}
              editable={canSendInvoice(invoice.status)}
              voidable={canVoidInvoice(invoice.status)}
              sendAction={sendInvoiceAction}
              voidAction={voidInvoiceAction}
            />
          </div>
        }
      />

      <div className="mt-6">
        <StatusBadge status={invoice.displayStatus} />
        {invoice.displayStatus !== invoice.status ? (
          <span className="ml-3 text-sm text-neutral-500">Stored status: {invoice.status}</span>
        ) : null}
      </div>

      <section aria-labelledby="summary-heading" className="mt-6 grid gap-3 sm:grid-cols-4">
        <h2 id="summary-heading" className="sr-only">
          Invoice summary
        </h2>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Customer</p>
          <p className="mt-1 text-sm font-medium">{invoice.customer.name}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Total</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {invoice.currency} {invoice.totalAmount}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Paid</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{invoice.amountPaid}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Outstanding</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{invoice.outstandingAmount}</p>
        </div>
      </section>

      <section aria-labelledby="items-heading" className="mt-10">
        <h2 id="items-heading" className="text-lg font-semibold">
          Line items
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Description</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Qty</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Unit price</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{item.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.unitPrice}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto mt-4 max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Subtotal</dt>
            <dd className="tabular-nums">{invoice.subtotal}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Discount</dt>
            <dd className="tabular-nums">−{invoice.discount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Tax</dt>
            <dd className="tabular-nums">+{invoice.tax}</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold dark:border-neutral-800">
            <dt>Total</dt>
            <dd className="tabular-nums">{invoice.totalAmount}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="payments-heading" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="payments-heading" className="text-lg font-semibold">Payment history</h2>
          <Link
            href="/dashboard/payments"
            className="text-sm text-neutral-500 hover:underline"
          >
            All payments →
          </Link>
        </div>
        {payments ? (
          <div className="mt-3">
            <PaymentHistory
              payments={payments.items}
              emptyMessage="No payments have been recorded against this invoice."
            />
          </div>
        ) : (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            Payment history could not be loaded. Please refresh the page.
          </p>
        )}
        {showPaymentForm ? (
          <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="text-sm font-semibold">Record a payment</h3>
            <div className="mt-4">
              <PaymentForm
                invoiceNumber={invoice.invoiceNumber}
                currency={invoice.currency}
                outstandingAmount={invoice.outstandingAmount}
                defaultDate={businessLocalDate("Asia/Kolkata")}
                action={recordPaymentAction.bind(null, invoice.id)}
              />
            </div>
          </div>
        ) : null}
      </section>

      {invoice.notes ? (
        <section aria-labelledby="notes-heading" className="mt-10">
          <h2 id="notes-heading" className="text-lg font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
            {invoice.notes}
          </p>
        </section>
      ) : null}
    </main>
  );
}
