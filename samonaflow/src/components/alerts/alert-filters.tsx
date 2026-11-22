import Link from "next/link";
import {
  ALERT_SEVERITY_LABELS,
  ALERT_TYPE_LABELS,
} from "@/lib/alert-rules";
import type { ListAlertsQuery } from "@/lib/validations/alert";
import { ALERT_SEVERITIES, ALERT_TYPES } from "@/types/alert";

const SELECT_CLASS =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900";

export function AlertFilters({ query }: { query: ListAlertsQuery }) {
  return (
    <form
      method="get"
      className="mt-6 grid gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <label htmlFor="type" className="mb-1 block text-sm font-medium">
          Alert type
        </label>
        <select id="type" name="type" defaultValue={query.type ?? ""} className={`${SELECT_CLASS} w-full`}>
          <option value="">All types</option>
          {ALERT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ALERT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="severity" className="mb-1 block text-sm font-medium">
          Severity
        </label>
        <select
          id="severity"
          name="severity"
          defaultValue={query.severity ?? ""}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="">All severities</option>
          {ALERT_SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {ALERT_SEVERITY_LABELS[severity]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="read" className="mb-1 block text-sm font-medium">
          Read state
        </label>
        <select id="read" name="read" defaultValue={query.read} className={`${SELECT_CLASS} w-full`}>
          <option value="all">All alerts</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </select>
      </div>
      <div>
        <label htmlFor="status" className="mb-1 block text-sm font-medium">
          Lifecycle
        </label>
        <select id="status" name="status" defaultValue={query.status} className={`${SELECT_CLASS} w-full`}>
          <option value="active">Active</option>
          <option value="all">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>
      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={query.sort} className={`${SELECT_CLASS} w-full`}>
          <option value="createdAt">Created at</option>
          <option value="severity">Severity</option>
          <option value="type">Alert type</option>
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
          <option value="desc">Newest / highest first</option>
          <option value="asc">Oldest / lowest first</option>
        </select>
      </div>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:text-white"
        >
          Apply filters
        </button>
        <Link
          href="/dashboard/alerts"
          className="px-2 py-2 text-sm text-neutral-500 hover:underline"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}
