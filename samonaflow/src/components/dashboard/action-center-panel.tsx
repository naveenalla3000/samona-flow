import Link from "next/link";
import { EvaluateAlertsButton } from "@/components/alerts/alert-actions";
import { AlertSeverityBadge } from "@/components/alerts/alert-layout";
import { ALERT_TYPE_LABELS } from "@/lib/alert-rules";
import type { AlertCounts, AlertRelatedEntityType } from "@/types/alert";
import type { DashboardAction } from "@/types/dashboard";
import {
  DashboardSection,
  EmptyState,
  InlineLink,
  SectionError,
} from "./dashboard-ui";

const RECORD_LABELS: Record<AlertRelatedEntityType, string> = {
  INVOICE: "View invoice",
  EXPENSE: "View expense",
  CUSTOMER: "View customer",
  FORECAST: "View forecast",
};

const RECORD_LINK =
  "inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export type ActionCenterData = {
  counts: AlertCounts;
  total: number;
  items: DashboardAction[];
};

export function ActionCenterPanel({
  data,
  error = false,
}: {
  data: ActionCenterData | null;
  error?: boolean;
}) {
  return (
    <DashboardSection
      id="action-center"
      title="Financial action center"
      description="Active alerts ordered by severity. Critical items appear first; nothing is sent automatically."
      action={<InlineLink href="/dashboard/alerts">Open action center</InlineLink>}
    >
      {error || data === null ? (
        <SectionError message="Alerts could not be loaded. Open the action center or refresh the page to try again." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
              {data.counts.critical} critical
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {data.counts.warning} warning
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
              {data.counts.info} info
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600">
              {data.counts.unread} unread
            </span>
            <span className="text-zinc-500">
              {data.total} active alert{data.total === 1 ? "" : "s"}
            </span>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="No active alerts"
              description="Run an evaluation to check overdue invoices, upcoming expenses, partial payments and potential cash shortages."
              action={<EvaluateAlertsButton label="Evaluate now" />}
            />
          ) : (
            <ul aria-label="Active alerts, critical first" className="space-y-2">
              {data.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-zinc-100 bg-white p-3 transition-colors hover:border-zinc-200 hover:bg-zinc-50/60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertSeverityBadge severity={item.severity} />
                    {!item.isRead ? (
                      <span
                        className="inline-block size-1.5 rounded-full bg-sky-500"
                        aria-label="Unread"
                        title="Unread"
                      />
                    ) : null}
                    <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                      {ALERT_TYPE_LABELS[item.type]}
                    </span>
                  </div>
                  <Link
                    href={item.alertHref}
                    className={`mt-1.5 block text-sm leading-snug hover:underline ${
                      item.isRead ? "font-medium text-zinc-700" : "font-semibold text-zinc-900"
                    }`}
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                    {item.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.record ? (
                      <Link href={item.record.href} className={RECORD_LINK}>
                        {RECORD_LABELS[item.record.type]}
                      </Link>
                    ) : null}
                    <Link href={item.alertHref} className={RECORD_LINK}>
                      Review alert
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
            <InlineLink href="/dashboard/alerts">View all alerts and history</InlineLink>
            {data.items.length > 0 ? <EvaluateAlertsButton label="Evaluate now" /> : null}
          </div>
        </div>
      )}
    </DashboardSection>
  );
}
