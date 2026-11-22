import Link from "next/link";
import { connection } from "next/server";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { InvoiceList } from "@/components/invoices/invoice-list";
import { InvoicesHeader, InvoiceLoadError, NoBusinessState } from "@/components/invoices/invoice-layout";
import { InvoicePagination } from "@/components/invoices/invoice-pagination";
import { listInvoicesQuerySchema } from "@/lib/validations/invoice";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { customerService } from "@/server/services/customer-service";
import { invoiceService } from "@/server/services/invoice-service";

// Session, search params and database reads happen at request time.
export const metadata = { title: "Invoices" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const raw = await searchParams;
  const parsed = listInvoicesQuerySchema.safeParse({
    page: first(raw.page),
    pageSize: first(raw.pageSize),
    search: first(raw.search),
    status: first(raw.status),
    customerId: first(raw.customerId),
    fromDate: first(raw.fromDate),
    toDate: first(raw.toDate),
    sort: first(raw.sort),
    direction: first(raw.direction),
  });
  const query = parsed.success ? parsed.data : listInvoicesQuerySchema.parse({});

  let result;
  let customers;
  try {
    [result, customers] = await Promise.all([
      invoiceService.list(user, business.businessId, query),
      customerService.list(user, business.businessId, {
        page: 1,
        pageSize: 100,
        status: "all",
        sort: "name",
        direction: "asc",
      }),
    ]);
  } catch {
    return <InvoiceLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <InvoicesHeader
        title="Invoices"
        subtitle="Create, track and review invoices for your business."
        action={
          <Link
            href="/dashboard/invoices/new"
            className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 dark:bg-blue-600 dark:text-white"
          >
            Create invoice
          </Link>
        }
      />
      <InvoiceFilters
        query={query}
        customers={customers.items.map((customer) => ({ id: customer.id, name: customer.name }))}
      />
      <InvoiceList invoices={result.items} />
      <InvoicePagination query={query} totalPages={result.totalPages} total={result.total} />
    </main>
  );
}
