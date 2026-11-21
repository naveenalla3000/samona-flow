import Link from "next/link";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { CustomerList } from "@/components/customers/customer-list";
import { CustomerPagination } from "@/components/customers/customer-pagination";
import {
  CustomerLoadError,
  CustomersHeader,
  NoBusinessState,
} from "@/components/customers/customer-layout";
import { listCustomersQuerySchema } from "@/lib/validations/customer";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { customerService } from "@/server/services/customer-service";

// Session and database reads happen at request time.
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const raw = await searchParams;
  const parsed = listCustomersQuerySchema.safeParse({
    page: first(raw.page),
    pageSize: first(raw.pageSize),
    search: first(raw.search),
    status: first(raw.status),
    sort: first(raw.sort),
    direction: first(raw.direction),
  });
  const query = parsed.success ? parsed.data : listCustomersQuerySchema.parse({});

  let result;
  try {
    result = await customerService.list(user, business.businessId, query);
  } catch {
    return <CustomerLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <CustomersHeader
        title="Customers"
        subtitle="Manage the people and businesses you invoice."
        action={
          <Link
            href="/dashboard/customers/new"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Add customer
          </Link>
        }
      />
      <CustomerFilters query={query} />
      <CustomerList customers={result.items} />
      <CustomerPagination query={query} totalPages={result.totalPages} total={result.total} />
    </main>
  );
}
