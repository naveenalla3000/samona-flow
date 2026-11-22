import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoicesHeader, NoBusinessState } from "@/components/invoices/invoice-layout";
import { invoiceIdSchema } from "@/lib/validations/invoice";
import { updateInvoiceAction } from "@/server/actions/invoice-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { customerService } from "@/server/services/customer-service";
import { InvoiceServiceError, invoiceService } from "@/server/services/invoice-service";
import type { InvoiceDetail } from "@/types/invoice";
import type { InvoiceFormValues } from "@/types/invoice-form";

export const metadata = { title: "Edit invoice" };

export const instant = false;

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  await connection();
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

  if (!invoice.isEditable) {
    redirect(`/dashboard/invoices/${invoice.id}`);
  }

  const customers = await customerService.list(user, business.businessId, {
    page: 1,
    pageSize: 100,
    status: "all",
    sort: "name",
    direction: "asc",
  });

  const defaultValues: InvoiceFormValues = {
    customerId: invoice.customerId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    notes: invoice.notes ?? "",
    discount: invoice.discount,
    tax: invoice.tax,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <InvoicesHeader title="Edit invoice" subtitle={invoice.invoiceNumber} />
      <InvoiceForm
        customers={customers.items.map((customer) => ({
          id: customer.id,
          name: customer.name,
          companyName: customer.companyName,
        }))}
        defaultValues={defaultValues}
        action={updateInvoiceAction.bind(null, invoice.id)}
        cancelHref={`/dashboard/invoices/${invoice.id}`}
        submitLabel="Save draft changes"
      />
    </main>
  );
}
