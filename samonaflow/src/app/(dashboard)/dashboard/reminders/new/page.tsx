import Link from "next/link";
import { connection } from "next/server";
import {
  ReminderForm,
  type InvoiceOption,
} from "@/components/reminders/reminder-form";
import {
  NoBusinessState,
  RemindersHeader,
} from "@/components/reminders/reminder-layout";
import { businessLocalDate } from "@/lib/business-date";
import { parseSignedMoney } from "@/lib/invoice-math";
import { suggestReminderType } from "@/lib/reminder-status";
import { listInvoicesQuerySchema } from "@/lib/validations/invoice";
import { createReminderAction } from "@/server/actions/reminder-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { prismaInvoiceRepository } from "@/server/repositories/invoice-repository";
import { invoiceService } from "@/server/services/invoice-service";

export const metadata = { title: "New reminder" };

export const instant = false;

const REMINDABLE = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;


export default async function NewReminderPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const [invoices, profile] = await Promise.all([
    invoiceService.list(
      user,
      business.businessId,
      listInvoicesQuerySchema.parse({ pageSize: 100, sort: "dueDate", direction: "asc" }),
    ),
    prismaInvoiceRepository.findBusinessProfile(business.businessId),
  ]);
  const today = businessLocalDate(profile?.timezone ?? "Asia/Kolkata");

  const options: InvoiceOption[] = invoices.items
    .filter(
      (invoice) =>
        REMINDABLE.includes(invoice.status) && parseSignedMoney(invoice.outstandingAmount) > BigInt(0),
    )
    .map((invoice) => ({
      id: invoice.id,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      invoiceNumber: invoice.invoiceNumber,
      dueDate: invoice.dueDate,
      outstandingAmount: invoice.outstandingAmount,
      currency: invoice.currency,
      statusLabel: invoice.displayStatus.toLowerCase(),
      suggestedType: suggestReminderType(invoice.dueDate, today),
    }));

  // Customer/invoice detail pages link here so the relevant invoice is preselected.
  const params = await searchParams;
  const preferredCustomer = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const preferredInvoice = Array.isArray(params.invoiceId) ? params.invoiceId[0] : params.invoiceId;
  options.sort((a, b) => {
    const score = (option: InvoiceOption) =>
      option.id === preferredInvoice ? 2 : option.customerId === preferredCustomer ? 1 : 0;
    return score(b) - score(a);
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <RemindersHeader
        title="Generate reminder"
        subtitle="Choose an issued invoice. The message is built from its verified amount and due date."
      />
      {options.length === 0 ? (
        <div role="status" className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
          <h2 className="text-lg font-medium">No invoices need a reminder</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Issue an invoice with an outstanding balance first.
          </p>
          <Link href="/dashboard/invoices/new" className="mt-4 inline-block text-sm font-medium underline">
            Create invoice
          </Link>
        </div>
      ) : (
        <ReminderForm invoices={options} action={createReminderAction} cancelHref="/dashboard/reminders" />
      )}
    </main>
  );
}
