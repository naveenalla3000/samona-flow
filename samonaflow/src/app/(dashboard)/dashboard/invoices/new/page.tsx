import Link from "next/link";
import { connection } from "next/server";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoicesHeader, NoBusinessState } from "@/components/invoices/invoice-layout";
import { businessLocalDate, dateAfter } from "@/lib/business-date";
import { createInvoiceAction } from "@/server/actions/invoice-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { prismaInvoiceRepository } from "@/server/repositories/invoice-repository";
import { customerService } from "@/server/services/customer-service";
import type { InvoiceFormValues } from "@/types/invoice-form";

export const metadata = { title: "New invoice" };

export const instant = false;


export default async function NewInvoicePage() {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const [customers, businessProfile] = await Promise.all([
    customerService.list(user, business.businessId, {
      page: 1,
      pageSize: 100,
      status: "all",
      sort: "name",
      direction: "asc",
    }),
    prismaInvoiceRepository.findBusinessProfile(business.businessId),
  ]);
  const today = businessLocalDate(businessProfile?.timezone ?? "Asia/Kolkata");

  const defaultValues: InvoiceFormValues = {
    customerId: "",
    issueDate: today,
    dueDate: dateAfter(today, 14),
    currency: businessProfile?.currency ?? "INR",
    notes: "",
    discount: "0.00",
    tax: "0.00",
    items: [{ description: "", quantity: "1", unitPrice: "0.00" }],
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <InvoicesHeader
        title="Create invoice"
        subtitle="Totals are calculated on the server when you save."
      />
      {customers.items.length === 0 ? (
        <div role="status" className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add a customer before creating an invoice.{" "}
          <Link href="/dashboard/customers/new" className="font-medium underline">
            Add customer
          </Link>
        </div>
      ) : null}
      <InvoiceForm
        customers={customers.items.map((customer) => ({
          id: customer.id,
          name: customer.name,
          companyName: customer.companyName,
        }))}
        defaultValues={defaultValues}
        action={createInvoiceAction}
        cancelHref="/dashboard/invoices"
        submitLabel="Create draft invoice"
      />
    </main>
  );
}
