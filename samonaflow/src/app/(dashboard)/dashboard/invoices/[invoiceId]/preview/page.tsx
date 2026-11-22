import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { PrintButton } from "@/components/invoices/print-button";
import { InvoicesHeader, NoBusinessState } from "@/components/invoices/invoice-layout";
import { invoiceIdSchema } from "@/lib/validations/invoice";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { prismaInvoiceRepository } from "@/server/repositories/invoice-repository";
import { InvoiceServiceError, invoiceService } from "@/server/services/invoice-service";
import type { InvoiceBusinessProfile, InvoiceDetail } from "@/types/invoice";

export const metadata = { title: "Invoice preview" };

export const instant = false;

export default async function InvoicePreviewPage({
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

  const profile = await prismaInvoiceRepository.findBusinessProfile(business.businessId);
  if (!profile) return <NoBusinessState />;

  const businessProfile: InvoiceBusinessProfile = {
    name: profile.name,
    ownerName: profile.ownerName,
    email: profile.email,
    phone: profile.phone,
    currency: profile.currency,
    timezone: profile.timezone,
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div data-print-hide>
        <InvoicesHeader
          title="Invoice preview"
          subtitle="Use your browser's print dialog to print or save as PDF."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <PrintButton />
              <Link
                href={`/dashboard/invoices/${invoice.id}`}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Back to invoice
              </Link>
            </div>
          }
        />
      </div>
      <InvoicePreview invoice={invoice} business={businessProfile} />
    </main>
  );
}
