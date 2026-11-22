import Link from "next/link";
import { StatusBadge } from "@/components/invoices/invoice-layout";
import type { InvoiceListItem } from "@/types/invoice";

export function InvoiceList({ invoices }: { invoices: InvoiceListItem[] }) {
  if (invoices.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <h2 className="text-lg font-medium">No invoices found</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Try a different search, or create your first invoice to get started.
        </p>
        <Link
          href="/dashboard/invoices/new"
          className="mt-4 inline-block rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Create invoice
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-white text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
            <th scope="col" className="px-4 py-3 font-medium">Customer</th>
            <th scope="col" className="px-4 py-3 font-medium">Issued</th>
            <th scope="col" className="px-4 py-3 font-medium">Due</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Outstanding</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-white">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/invoices/${invoice.id}`}
                  className="font-medium hover:underline"
                >
                  {invoice.invoiceNumber}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="block">{invoice.customerName}</span>
                {invoice.customerCompanyName ? (
                  <span className="block text-xs text-neutral-500">{invoice.customerCompanyName}</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-neutral-600">{invoice.issueDate}</td>
              <td className="px-4 py-3 text-neutral-600">{invoice.dueDate}</td>
              <td className="px-4 py-3">
                <StatusBadge status={invoice.displayStatus} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {invoice.currency} {invoice.totalAmount}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {invoice.currency} {invoice.outstandingAmount}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
                  <Link href={`/dashboard/invoices/${invoice.id}`} className="text-sm hover:underline">
                    View
                  </Link>
                  {invoice.isEditable ? (
                    <Link
                      href={`/dashboard/invoices/${invoice.id}/edit`}
                      className="text-sm hover:underline"
                    >
                      Edit
                    </Link>
                  ) : null}
                  <Link
                    href={`/dashboard/invoices/${invoice.id}/preview`}
                    className="text-sm hover:underline"
                  >
                    Preview
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
