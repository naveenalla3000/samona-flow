import Link from "next/link";
import type { ListAlertsQuery } from "@/lib/validations/alert";

function pageHref(query: ListAlertsQuery, page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(query.pageSize));
  if (query.type) params.set("type", query.type);
  if (query.severity) params.set("severity", query.severity);
  params.set("read", query.read);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("direction", query.direction);
  return `/dashboard/alerts?${params.toString()}`;
}

export function AlertPagination({
  query,
  totalPages,
  total,
}: {
  query: ListAlertsQuery;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) {
    return <p className="mt-4 text-sm text-neutral-500">{total} alert(s)</p>;
  }

  return (
    <nav
      aria-label="Alert pages"
      className="mt-6 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-neutral-500">
        Page {query.page} of {totalPages} · {total} alert(s)
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
