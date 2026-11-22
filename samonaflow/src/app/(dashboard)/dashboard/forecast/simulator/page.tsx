import { connection } from "next/server";
import { ForecastSummary } from "@/components/forecast/forecast-summary";
import { ForecastSimulator } from "@/components/forecast/forecast-simulator";
import {
  ForecastLoadError,
  ForecastNoBusinessState,
  ForecastSimulatorHeader,
} from "@/components/forecast/forecast-layout";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import { requireUser } from "@/server/auth/require-auth";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { forecastService } from "@/server/services/forecast-service";

export const metadata = { title: "What-if simulator" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ForecastSimulatorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // "Today" is read from the clock, so this page must render per request.
  await connection();

  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <ForecastNoBusinessState />;

  const raw = await searchParams;
  const parsed = forecastQuerySchema.safeParse({ horizon: first(raw.horizon) });
  const query = parsed.success ? parsed.data : forecastQuerySchema.parse({});

  let forecast;
  try {
    forecast = await forecastService.getForecast(user, business.businessId, query);
  } catch {
    return <ForecastLoadError />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12">
      <ForecastSimulatorHeader horizon={query.horizon} />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Baseline overview</h2>
          <p className="mt-1 text-sm text-neutral-500">
            The current {query.horizon}-day forecast, calculated from existing records. Every
            simulation below is compared with this unchanged baseline.
          </p>
        </div>
        <ForecastSummary forecast={forecast} />
      </section>

      <ForecastSimulator
        key={query.horizon}
        businessId={business.businessId}
        horizon={query.horizon}
        currency={forecast.currency}
        invoices={forecast.incoming}
        expenses={forecast.outgoing}
      />
    </main>
  );
}
