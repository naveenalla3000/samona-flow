import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/expense-status";
import type { ListExpensesQuery } from "@/lib/validations/expense";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";
const SELECT_CLASS =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

export function ExpenseFilters({ query }: { query: ListExpensesQuery }) {
  return (
    <form method="get" className="mt-6 grid gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <label htmlFor="search" className="mb-1 block text-sm font-medium">Search</label>
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={query.search ?? ""}
          placeholder="Title or notes"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="status" className="mb-1 block text-sm font-medium">Status</label>
        <select id="status" name="status" defaultValue={query.status} className={`${SELECT_CLASS} w-full`}>
          <option value="all">All statuses</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="OVERDUE">Overdue</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Category</label>
        <select id="category" name="category" defaultValue={query.category ?? ""} className={`${SELECT_CLASS} w-full`}>
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>{EXPENSE_CATEGORY_LABELS[category]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fromDate" className="mb-1 block text-sm font-medium">Due from</label>
        <input id="fromDate" name="fromDate" type="date" defaultValue={query.fromDate ?? ""} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="toDate" className="mb-1 block text-sm font-medium">Due to</label>
        <input id="toDate" name="toDate" type="date" defaultValue={query.toDate ?? ""} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">Sort by</label>
        <select id="sort" name="sort" defaultValue={query.sort} className={`${SELECT_CLASS} w-full`}>
          <option value="dueDate">Due date</option>
          <option value="amount">Amount</option>
          <option value="title">Title</option>
          <option value="createdAt">Created at</option>
          <option value="status">Status</option>
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
