import {
  AlertFilters,
} from "@/components/alerts/alert-filters";
import {
  AlertList,
} from "@/components/alerts/alert-list";
import {
  AlertLoadError,
  AlertsHeader,
  NoBusinessState,
} from "@/components/alerts/alert-layout";
import { AlertPagination } from "@/components/alerts/alert-pagination";
import { EvaluateAlertsButton } from "@/components/alerts/alert-actions";
import { listAlertsQuerySchema } from "@/lib/validations/alert";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { alertService } from "@/server/services/alert-service";

export const metadata = { title: "Alerts" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AlertsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const raw = await searchParams;
  const parsed = listAlertsQuerySchema.safeParse({
    type: first(raw.type),
    severity: first(raw.severity),
    read: first(raw.read),
    status: first(raw.status),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
    sort: first(raw.sort),
    direction: first(raw.direction),
  });
  const query = parsed.success ? parsed.data : listAlertsQuerySchema.parse({});

  let result;
  try {
    result = await alertService.list(user, business.businessId, query);
  } catch {
    return <AlertLoadError />;
  }

  const counts = result.counts;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <AlertsHeader
        title="Smart alerts"
        subtitle="Deterministic warnings from your invoices, expenses, receivables and cash-flow forecast. Evaluation runs only when you ask it to."
        action={<EvaluateAlertsButton />}
      />

      <section
        aria-label="Alert summary"
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        <SummaryTile label="Active" value={counts.active} />
        <SummaryTile label="Unread" value={counts.unread} />
        <SummaryTile label="Critical" value={counts.critical} tone="critical" />
        <SummaryTile label="Warning" value={counts.warning} tone="warning" />
        <SummaryTile label="Info" value={counts.info} tone="info" />
      </section>

      <AlertFilters query={query} />

      <section aria-label="Alert list" className="mt-6">
        <AlertList
          alerts={result.items}
          emptyMessage={
            query.status === "active"
              ? "No active alerts match these filters. Run an evaluation to check the latest conditions."
              : "No alerts match these filters."
          }
        />
      </section>

      <AlertPagination query={query} totalPages={result.totalPages} total={result.total} />
    </main>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "critical" | "warning" | "info";
}) {
  const toneClass =
    tone === "critical"
      ? "text-red-700 dark:text-red-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "info"
          ? "text-sky-700 dark:text-sky-400"
          : "text-neutral-900 dark:text-neutral-100";

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
