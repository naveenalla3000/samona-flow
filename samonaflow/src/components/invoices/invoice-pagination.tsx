import Link from "next/link";
import type { ListInvoicesQuery } from "@/lib/validations/invoice";

function pageHref(query: ListInvoicesQuery, page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  params.set("status", query.status);
  if (query.customerId) params.set("customerId", query.customerId);
  if (query.fromDate) params.set("fromDate", query.fromDate);
  if (query.toDate) params.set("toDate", query.toDate);
  params.set("sort", query.sort);
  params.set("direction", query.direction);
  return `/dashboard/invoices?${params.toString()}`;
}

export function InvoicePagination({
  query,
  totalPages,
  total,
}: {
  query: ListInvoicesQuery;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) {
    return <p className="mt-4 text-sm text-neutral-500">{total} invoice(s)</p>;
  }

  return (
    <nav aria-label="Invoice pages" className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-neutral-500">
        Page {query.page} of {totalPages} · {total} invoice(s)
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
