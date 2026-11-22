import Link from "next/link";
import type { ListExpensesQuery } from "@/lib/validations/expense";

function pageHref(query: ListExpensesQuery, page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.fromDate) params.set("fromDate", query.fromDate);
  if (query.toDate) params.set("toDate", query.toDate);
  params.set("sort", query.sort);
  params.set("direction", query.direction);
  return `/dashboard/expenses?${params.toString()}`;
}

export function ExpensePagination({
  query,
  totalPages,
  total,
}: {
  query: ListExpensesQuery;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) {
    return <p className="mt-4 text-sm text-neutral-500">{total} expense(s)</p>;
  }

  return (
    <nav aria-label="Expense pages" className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-neutral-500">
        Page {query.page} of {totalPages} · {total} expense(s)
      </p>
      <div className="flex gap-2">
        {query.page > 1 ? (
          <Link
            href={pageHref(query, query.page - 1)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
            aria-label="Previous page"
          >
            Previous
          </Link>
        ) : null}
        {query.page < totalPages ? (
          <Link
            href={pageHref(query, query.page + 1)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
            aria-label="Next page"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
