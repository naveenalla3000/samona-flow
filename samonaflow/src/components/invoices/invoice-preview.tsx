import { StatusBadge } from "@/components/invoices/invoice-layout";
import type { InvoiceBusinessProfile, InvoiceDetail } from "@/types/invoice";

/**
 * Print-optimised invoice document. PRD FR-04 requires PDF generation/share
 * but marks them P1 in the roadmap; no PDF library is installed, so this
 * module provides a browser "Print / Save as PDF" preview instead. The print
 * stylesheet removes app chrome and page margins.
 */
export function InvoicePreview({
  invoice,
  business,
}: {
  invoice: InvoiceDetail;
  business: InvoiceBusinessProfile;
}) {
  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; }
          [data-print-hide] { display: none !important; }
          .invoice-print { max-width: none !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
          @page { margin: 16mm; }
        }
      `}</style>
      <article
        className="invoice-print mx-auto mt-8 max-w-3xl rounded-lg border border-neutral-200 bg-white p-8 text-neutral-900 shadow-sm"
        aria-label={`Invoice ${invoice.invoiceNumber}`}
      >
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">Invoice</p>
            <h2 className="mt-1 text-3xl font-semibold">{invoice.invoiceNumber}</h2>
            <div className="mt-3">
              <StatusBadge status={invoice.displayStatus} />
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="text-lg font-semibold">{business.name}</p>
            <p>{business.ownerName}</p>
            <p>{business.email}</p>
            {business.phone ? <p>{business.phone}</p> : null}
          </div>
        </header>

        <section className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-neutral-500">Bill to</h3>
            <p className="mt-2 font-medium">{invoice.customer.name}</p>
            {invoice.customer.companyName ? <p>{invoice.customer.companyName}</p> : null}
            {invoice.customer.email ? <p>{invoice.customer.email}</p> : null}
            {invoice.customer.phone ? <p>{invoice.customer.phone}</p> : null}
          </div>
          <div className="sm:text-right">
            <dl className="space-y-1">
              <div className="flex justify-between gap-6 sm:justify-end">
                <dt className="text-neutral-500">Issue date</dt>
                <dd className="font-medium">{invoice.issueDate}</dd>
              </div>
              <div className="flex justify-between gap-6 sm:justify-end">
                <dt className="text-neutral-500">Due date</dt>
                <dd className="font-medium">{invoice.dueDate}</dd>
              </div>
              {invoice.expectedPaymentDate ? (
                <div className="flex justify-between gap-6 sm:justify-end">
                  <dt className="text-neutral-500">Expected payment</dt>
                  <dd className="font-medium">{invoice.expectedPaymentDate}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <table className="mt-8 w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="py-2 font-medium">Description</th>
              <th scope="col" className="py-2 text-right font-medium">Qty</th>
              <th scope="col" className="py-2 text-right font-medium">Unit price</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td className="py-3">{item.description}</td>
                <td className="py-3 text-right tabular-nums">{item.quantity}</td>
                <td className="py-3 text-right tabular-nums">{item.unitPrice}</td>
                <td className="py-3 text-right tabular-nums">{item.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
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
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
              <dt>Total ({invoice.currency})</dt>
              <dd className="tabular-nums">{invoice.totalAmount}</dd>
            </div>
            <div className="flex justify-between text-neutral-500">
              <dt>Amount paid</dt>
              <dd className="tabular-nums">{invoice.amountPaid}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Outstanding</dt>
              <dd className="tabular-nums">{invoice.outstandingAmount}</dd>
            </div>
          </dl>
        </section>

        {invoice.notes ? (
          <section className="mt-8 border-t border-neutral-200 pt-6 text-sm">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500">Notes</h3>
            <p className="mt-2 whitespace-pre-wrap">{invoice.notes}</p>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
          Thank you for your business.
        </footer>
      </article>
    </>
  );
}
