import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveCustomerButton } from "@/components/customers/archive-customer-button";
import { CustomersHeader, NoBusinessState } from "@/components/customers/customer-layout";
import { archiveCustomerAction } from "@/server/actions/customer-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { customerIdSchema } from "@/lib/validations/customer";
import { CustomerServiceError, customerService } from "@/server/services/customer-service";
import type { CustomerDetail } from "@/types/customer";

export const instant = false;

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-b border-neutral-200 py-2 dark:border-neutral-800">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { customerId: rawId } = await params;
  const parsedId = customerIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let customer: CustomerDetail;
  try {
    customer = await customerService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND") notFound();
    throw error;
  }

  const { financials, invoices } = customer;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <CustomersHeader
        title={customer.name}
        subtitle={customer.companyName ?? "Customer profile"}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/dashboard/reminders?customerId=${encodeURIComponent(customer.id)}`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Reminder history
            </Link>
            <Link
              href={`/dashboard/reminders/new?customerId=${encodeURIComponent(customer.id)}`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Generate reminder
            </Link>
            <ArchiveCustomerButton customerId={customer.id} action={archiveCustomerAction} />
            <Link
              href={`/dashboard/customers/${customer.id}/edit`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Edit
            </Link>
          </div>
        }
      />

      {customer.archivedAt ? (
        <p role="status" className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          This customer was archived on {formatDate(customer.archivedAt)}. Invoice history is still available.
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-lg font-semibold">Customer information</h2>
          <dl className="mt-3">
            <DetailRow label="Name" value={customer.name} />
            <DetailRow label="Email" value={customer.email} />
            <DetailRow label="Phone" value={customer.phone} />
            <DetailRow label="Company" value={customer.companyName} />
            <DetailRow label="Address" value={customer.address} />
            <DetailRow label="Notes" value={customer.notes} />
            <DetailRow label="Created" value={formatDate(customer.createdAt)} />
          </dl>
        </section>

        <section aria-labelledby="financials-heading">
          <h2 id="financials-heading" className="text-lg font-semibold">Financial summary</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Total invoiced</dt>
              <dd className="mt-1 text-xl font-semibold">{financials.totalInvoiced}</dd>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Payments received</dt>
              <dd className="mt-1 text-xl font-semibold">{financials.totalPaymentsReceived}</dd>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Outstanding</dt>
              <dd className="mt-1 text-xl font-semibold">{financials.outstandingAmount}</dd>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Invoices / overdue</dt>
              <dd className="mt-1 text-xl font-semibold">
                {financials.invoiceCount} / {financials.overdueInvoiceCount}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section aria-labelledby="invoice-history-heading" className="mt-10">
        <h2 id="invoice-history-heading" className="text-lg font-semibold">Invoice history</h2>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No invoices have been issued to this customer yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-3 font-medium">Issued</th>
                  <th scope="col" className="px-4 py-3 font-medium">Due</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">{invoice.issueDate}</td>
                    <td className="px-4 py-3">{invoice.dueDate}</td>
                    <td className="px-4 py-3">{invoice.status}</td>
                    <td className="px-4 py-3 text-right">{invoice.totalAmount}</td>
                    <td className="px-4 py-3 text-right">{invoice.outstandingAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
