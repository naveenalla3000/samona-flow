import Link from "next/link";
import { connection } from "next/server";
import {
  ReminderFilters,
} from "@/components/reminders/reminder-filters";
import {
  RemindersHeader,
  ReminderLoadError,
  NoBusinessState,
} from "@/components/reminders/reminder-layout";
import { ReminderList } from "@/components/reminders/reminder-list";
import { ReminderPagination } from "@/components/reminders/reminder-pagination";
import { listRemindersQuerySchema } from "@/lib/validations/reminder";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { reminderService } from "@/server/services/reminder-service";

export const metadata = { title: "Reminders" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RemindersPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const raw = await searchParams;
  const parsed = listRemindersQuerySchema.safeParse({
    page: first(raw.page),
    pageSize: first(raw.pageSize),
    search: first(raw.search),
    status: first(raw.status),
    type: first(raw.type),
    customerId: first(raw.customerId),
    invoiceId: first(raw.invoiceId),
    fromDate: first(raw.fromDate),
    toDate: first(raw.toDate),
    sort: first(raw.sort),
    direction: first(raw.direction),
  });
  const query = parsed.success ? parsed.data : listRemindersQuerySchema.parse({});

  let result;
  try {
    result = await reminderService.list(user, business.businessId, query);
  } catch {
    return <ReminderLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <RemindersHeader
        title="Reminders"
        subtitle="Payment follow-ups you generate and send yourself. No message is delivered automatically."
        action={
          <Link
            href="/dashboard/reminders/new"
            className="inline-block rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
          >
            Generate reminder
          </Link>
        }
      />
      <ReminderFilters query={query} />
      <section aria-label="Reminder list" className="mt-6">
        <ReminderList reminders={result.items} />
      </section>
      <ReminderPagination query={query} totalPages={result.totalPages} total={result.total} />
    </main>
  );
}
