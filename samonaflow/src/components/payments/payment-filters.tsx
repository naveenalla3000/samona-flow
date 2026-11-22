import type { ListPaymentsQuery } from "@/lib/validations/payment";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";
const SELECT_CLASS =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

export function PaymentFilters({ query }: { query: ListPaymentsQuery }) {
  return (
    <form method="get" className="mt-6 grid gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <label htmlFor="search" className="mb-1 block text-sm font-medium">Search</label>
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={query.search ?? ""}
          placeholder="Invoice, customer, reference or notes"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="status" className="mb-1 block text-sm font-medium">Status</label>
        <select id="status" name="status" defaultValue={query.status} className={`${SELECT_CLASS} w-full`}>
          <option value="all">All payments</option>
          <option value="RECORDED">Recorded</option>
          <option value="REVERSED">Reversed</option>
        </select>
      </div>
      <div>
        <label htmlFor="method" className="mb-1 block text-sm font-medium">Method</label>
        <select id="method" name="method" defaultValue={query.method ?? ""} className={`${SELECT_CLASS} w-full`}>
          <option value="">All methods</option>
          <option value="UPI">UPI</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CASH">Cash</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="fromDate" className="mb-1 block text-sm font-medium">Date from</label>
        <input id="fromDate" name="fromDate" type="date" defaultValue={query.fromDate ?? ""} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="toDate" className="mb-1 block text-sm font-medium">Date to</label>
        <input id="toDate" name="toDate" type="date" defaultValue={query.toDate ?? ""} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">Sort by</label>
        <select id="sort" name="sort" defaultValue={query.sort} className={`${SELECT_CLASS} w-full`}>
          <option value="paymentDate">Payment date</option>
          <option value="amount">Amount</option>
          <option value="createdAt">Recorded at</option>
        </select>
      </div>
      <div>
        <label htmlFor="direction" className="mb-1 block text-sm font-medium">Order</label>
        <select id="direction" name="direction" defaultValue={query.direction} className={`${SELECT_CLASS} w-full`}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>
      <div className="flex items-end lg:col-span-4">
        <button
          type="submit"
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
