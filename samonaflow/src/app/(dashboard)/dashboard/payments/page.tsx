import { connection } from "next/server";
import { PaymentFilters } from "@/components/payments/payment-filters";
import { PaymentHistory } from "@/components/payments/payment-history";
import { PaymentPagination } from "@/components/payments/payment-pagination";
import {
  NoBusinessState,
  PaymentLoadError,
  PaymentsHeader,
} from "@/components/payments/payment-layout";
import { listPaymentsQuerySchema } from "@/lib/validations/payment";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { paymentService } from "@/server/services/payment-service";

export const metadata = { title: "Payments" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}


export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const raw = await searchParams;
  const parsed = listPaymentsQuerySchema.safeParse({
    page: first(raw.page),
    pageSize: first(raw.pageSize),
    search: first(raw.search),
    status: first(raw.status),
    method: first(raw.method),
    invoiceId: first(raw.invoiceId),
    customerId: first(raw.customerId),
    fromDate: first(raw.fromDate),
    toDate: first(raw.toDate),
    sort: first(raw.sort),
    direction: first(raw.direction),
  });
  const query = parsed.success ? parsed.data : listPaymentsQuerySchema.parse({});

  let result;
  try {
    result = await paymentService.list(user, business.businessId, query);
  } catch {
    return <PaymentLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <PaymentsHeader
        title="Payments"
        subtitle="Recorded receipts and reversals across your business."
      />
      <PaymentFilters query={query} />
      <section aria-label="Payment history" className="mt-6">
        <PaymentHistory
          payments={result.items}
          emptyMessage={query.status === "REVERSED" ? "No reversed payments match these filters." : "No payments match these filters."}
        />
      </section>
      <PaymentPagination query={query} totalPages={result.totalPages} total={result.total} />
    </main>
  );
}
