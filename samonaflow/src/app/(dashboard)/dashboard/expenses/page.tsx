import Link from "next/link";
import { connection } from "next/server";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import {
  ExpensesHeader,
  ExpenseLoadError,
  NoBusinessState,
} from "@/components/expenses/expense-layout";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExpensePagination } from "@/components/expenses/expense-pagination";
import { listExpensesQuerySchema } from "@/lib/validations/expense";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { expenseService } from "@/server/services/expense-service";

export const metadata = { title: "Expenses" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const raw = await searchParams;
  const parsed = listExpensesQuerySchema.safeParse({
    page: first(raw.page),
    pageSize: first(raw.pageSize),
    search: first(raw.search),
    status: first(raw.status),
    category: first(raw.category),
    fromDate: first(raw.fromDate),
    toDate: first(raw.toDate),
    sort: first(raw.sort),
    direction: first(raw.direction),
  });
  const query = parsed.success ? parsed.data : listExpensesQuerySchema.parse({});

  let result;
  try {
    result = await expenseService.list(user, business.businessId, query);
  } catch {
    return <ExpenseLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <ExpensesHeader
        title="Expenses"
        subtitle="Business expenses and future commitments, including upcoming and overdue items."
        action={
          <Link
            href="/dashboard/expenses/new"
            className="inline-block rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
          >
            Add expense
          </Link>
        }
      />
      <ExpenseFilters query={query} />
      <section aria-label="Expense list" className="mt-6">
        <ExpenseList expenses={result.items} />
      </section>
      <ExpensePagination query={query} totalPages={result.totalPages} total={result.total} />
    </main>
  );
}
