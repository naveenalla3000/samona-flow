import Link from "next/link";
import type { ListCustomersQuery } from "@/lib/validations/customer";

const SELECT_CLASS =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

export function CustomerFilters({ query }: { query: ListCustomersQuery }) {
  return (
    <form
      method="get"
      className="mt-6 grid gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div className="lg:col-span-2">
        <label htmlFor="search" className="mb-1 block text-sm font-medium">
          Search
        </label>
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={query.search ?? ""}
          placeholder="Name, email, phone or company"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
        />
      </div>

      <div>
        <label htmlFor="status" className="mb-1 block text-sm font-medium">
          Status
        </label>
        <select id="status" name="status" defaultValue={query.status} className={`${SELECT_CLASS} w-full`}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={query.sort} className={`${SELECT_CLASS} w-full`}>
          <option value="name">Name</option>
          <option value="companyName">Company</option>
          <option value="createdAt">Created date</option>
          <option value="updatedAt">Updated date</option>
        </select>
      </div>

      <div>
        <label htmlFor="direction" className="mb-1 block text-sm font-medium">
          Order
        </label>
        <select
          id="direction"
          name="direction"
          defaultValue={query.direction}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      <input type="hidden" name="pageSize" value={query.pageSize} />
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-5">
        <button
          type="submit"
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
        >
          Apply
        </button>
        <Link href="/dashboard/customers" className="px-2 py-2 text-sm text-neutral-500 hover:underline">
          Clear
        </Link>
      </div>
    </form>
  );
}
