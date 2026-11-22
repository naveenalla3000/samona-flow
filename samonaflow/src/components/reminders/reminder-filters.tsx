import Link from "next/link";
import { REMINDER_TYPES, REMINDER_TYPE_LABELS } from "@/lib/reminder-status";
import type { ListRemindersQuery } from "@/lib/validations/reminder";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900";
const SELECT_CLASS =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900";

export function ReminderFilters({ query }: { query: ListRemindersQuery }) {
  return (
    <form method="get" className="mt-6 grid gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <label htmlFor="search" className="mb-1 block text-sm font-medium">Search</label>
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={query.search ?? ""}
          placeholder="Message, customer or invoice"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="status" className="mb-1 block text-sm font-medium">Status</label>
        <select id="status" name="status" defaultValue={query.status} className={`${SELECT_CLASS} w-full`}>
          <option value="all">All statuses</option>
          <option value="DRAFTED">Draft generated</option>
          <option value="WHATSAPP_OPENED">WhatsApp opened</option>
          <option value="MARKED_SENT">Marked sent</option>
          <option value="OVERDUE">Follow-up overdue</option>
          <option value="UPCOMING">Follow-up upcoming</option>
        </select>
      </div>
      <div>
        <label htmlFor="type" className="mb-1 block text-sm font-medium">Category</label>
        <select id="type" name="type" defaultValue={query.type ?? ""} className={`${SELECT_CLASS} w-full`}>
          <option value="">All categories</option>
          {REMINDER_TYPES.map((type) => (
            <option key={type} value={type}>{REMINDER_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fromDate" className="mb-1 block text-sm font-medium">Follow-up from</label>
        <input id="fromDate" name="fromDate" type="date" defaultValue={query.fromDate ?? ""} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="toDate" className="mb-1 block text-sm font-medium">Follow-up to</label>
        <input id="toDate" name="toDate" type="date" defaultValue={query.toDate ?? ""} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">Sort by</label>
        <select id="sort" name="sort" defaultValue={query.sort} className={`${SELECT_CLASS} w-full`}>
          <option value="followUpDate">Follow-up date</option>
          <option value="createdAt">Created at</option>
          <option value="reminderType">Category</option>
          <option value="status">Status</option>
          <option value="customerName">Customer</option>
        </select>
      </div>
      <div>
        <label htmlFor="direction" className="mb-1 block text-sm font-medium">Order</label>
        <select id="direction" name="direction" defaultValue={query.direction} className={`${SELECT_CLASS} w-full`}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:text-white"
        >
          Apply filters
        </button>
        <Link href="/dashboard/reminders" className="px-2 py-2 text-sm text-neutral-500 hover:underline">
          Clear
        </Link>
      </div>
    </form>
  );
}
