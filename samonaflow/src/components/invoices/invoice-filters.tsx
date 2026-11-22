import Link from "next/link";
import type { ListInvoicesQuery } from "@/lib/validations/invoice";

const SELECT_CLASS =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";
const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

const STATUSES = [
  ["all", "All statuses"],
  ["DRAFT", "Draft"],
  ["SENT", "Sent"],
  ["PARTIALLY_PAID", "Partially paid"],
  ["PAID", "Paid"],
  ["OVERDUE", "Overdue"],
  ["VOID", "Void"],
] as const;

export function InvoiceFilters({
  query,
  customers,
}: {
  query: ListInvoicesQuery;
  customers: { id: string; name: string }[];
}) {
  return (
    <form
      method="get"
      className="mt-6 grid gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4"
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
          placeholder="Number, customer or notes"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="status" className="mb-1 block text-sm font-medium">
          Status
        </label>
        <select id="status" name="status" defaultValue={query.status} className={`${SELECT_CLASS} w-full`}>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="customerId" className="mb-1 block text-sm font-medium">
          Customer
        </label>
        <select
          id="customerId"
          name="customerId"
          defaultValue={query.customerId ?? ""}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="">All customers</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="fromDate" className="mb-1 block text-sm font-medium">
          Issued from
        </label>
        <input
          id="fromDate"
          name="fromDate"
          type="date"
          defaultValue={query.fromDate ?? ""}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="toDate" className="mb-1 block text-sm font-medium">
          Issued to
        </label>
        <input
          id="toDate"
          name="toDate"
          type="date"
          defaultValue={query.toDate ?? ""}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={query.sort} className={`${SELECT_CLASS} w-full`}>
          <option value="issueDate">Issue date</option>
          <option value="dueDate">Due date</option>
          <option value="invoiceNumber">Invoice number</option>
          <option value="totalAmount">Total</option>
          <option value="status">Status</option>
          <option value="createdAt">Created</option>
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
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      <input type="hidden" name="pageSize" value={query.pageSize} />
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
        >
          Apply
        </button>
        <Link href="/dashboard/invoices" className="px-2 py-2 text-sm text-neutral-500 hover:underline">
          Clear
        </Link>
      </div>
    </form>
  );
}
