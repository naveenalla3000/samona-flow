import { connection } from "next/server";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import {
  ForecastIncomingBreakdown,
  ForecastOutgoingBreakdown,
} from "@/components/forecast/forecast-breakdown";
import {
  ForecastEstimateNote,
  ForecastHeader,
  ForecastLoadError,
  ForecastNoBusinessState,
  ForecastSection,
} from "@/components/forecast/forecast-layout";
import { ForecastSummary } from "@/components/forecast/forecast-summary";
import { ForecastTable } from "@/components/forecast/forecast-table";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { forecastService } from "@/server/services/forecast-service";

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Number() is used only to feed chart coordinates. Every authoritative amount
// remains a canonical decimal string produced by the server engine.
function toChartValue(value: string): number {
  return Number(value);
}

export default async function ForecastPage({ searchParams }: { searchParams: SearchParams }) {
  // "Today" is read from the clock below. Mark the route dynamic so Next does
  // not try to prerender a time-dependent financial projection.
  await connection();

  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <ForecastNoBusinessState />;

  const raw = await searchParams;
  const parsed = forecastQuerySchema.safeParse({
    horizon: first(raw.horizon),
    days: first(raw.days),
  });
  const query = parsed.success ? parsed.data : forecastQuerySchema.parse({});

  let forecast;
  try {
    forecast = await forecastService.getForecast(user, business.businessId, query);
  } catch {
    return <ForecastLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12">
      <ForecastHeader horizon={query.horizon} />
      <ForecastSummary forecast={forecast} />

      <ForecastSection
        title="Projected cash balance"
        description={`Daily timeline from ${forecast.startDate} to ${forecast.endDate}. The dashed line is zero.`}
      >
        <ForecastChart
          currency={forecast.currency}
          labels={forecast.daily.map((day) => day.date)}
          incoming={forecast.daily.map((day) => toChartValue(day.incoming))}
          outgoing={forecast.daily.map((day) => toChartValue(day.outgoing))}
          balance={forecast.daily.map((day) => toChartValue(day.projectedBalance))}
        />
      </ForecastSection>

      <ForecastSection
        title="Projected balance by week"
        description="Weekly totals and the closing balance at the end of each week."
      >
        <ForecastTable currency={forecast.currency} weeks={forecast.weekly} />
      </ForecastSection>

      <ForecastSection
        title="Incoming payments"
        description="Outstanding balances only. Partially paid invoices contribute their remaining amount; draft, void and paid invoices are excluded."
      >
        <ForecastIncomingBreakdown currency={forecast.currency} items={forecast.incoming} />
      </ForecastSection>

      <ForecastSection
        title="Outgoing expenses"
        description="Unpaid expenses due inside the horizon. Paid and cancelled expenses are excluded."
      >
        <ForecastOutgoingBreakdown currency={forecast.currency} items={forecast.outgoing} />
      </ForecastSection>

      <ForecastEstimateNote
        calculatedAt={forecast.calculatedAt}
        timezone={forecast.timezone}
      />
    </main>
  );
}
