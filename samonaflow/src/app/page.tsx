import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import Link from "next/link";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SamonaFlow — Cash flow clarity for independent businesses",
  description:
    "Track invoices, payments, expenses, and forecasts in one calm workspace built for freelancers and independent professionals.",
};

const benefits = [
  {
    title: "Know what’s coming",
    description:
      "See expected payments, upcoming expenses, and cash flow before they surprise you.",
  },
  {
    title: "Stay on top of receivables",
    description:
      "Track invoices, record payments, and follow up without digging through spreadsheets.",
  },
  {
    title: "Act with confidence",
    description:
      "Use clear summaries and alerts to make day-to-day financial decisions faster.",
  },
] as const;

const steps = [
  {
    number: "01",
    title: "Set up your workspace",
    description:
      "Add your business details, customers, and opening balance so everything starts from a clear baseline.",
  },
  {
    number: "02",
    title: "Track money in motion",
    description:
      "Record invoices, payments, and expenses as they happen, without losing context across tools.",
  },
  {
    number: "03",
    title: "Plan ahead with clarity",
    description:
      "Use forecasts and alerts to understand what’s next and make decisions before they become urgent.",
  },
] as const;

export default function HomePage() {
  return (
    <main
      className={`${display.variable} ${body.variable} bg-white text-slate-900`}
      style={{ fontFamily: "var(--font-body), sans-serif" }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
              S
            </span>
            <span className="text-sm font-semibold tracking-[0.01em] text-slate-900">
              SamonaFlow
            </span>
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
          >
            Sign in
          </Link>
        </header>

        <section className="py-16 sm:py-20 lg:py-28">
          <div className="grid w-full gap-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end lg:gap-16">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Financial workspace
              </p>
              <h1
                className="mt-6 max-w-4xl text-[clamp(2.75rem,8vw,6.25rem)] leading-[0.94] font-medium tracking-[-0.045em] text-slate-950"
                style={{ fontFamily: "var(--font-display), serif" }}
              >
                Cash flow,
                <span className="block text-slate-700">without the noise.</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                SamonaFlow helps freelancers and independent businesses track
                invoices, payments, expenses, and forecasts in one calm,
                clear workspace.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-900 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
                >
                  Create your workspace
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
                >
                  Sign in
                </Link>
              </div>

              <p className="mt-5 text-sm text-slate-500">
                Built for invoices, receivables, expenses, and cash-flow planning.
              </p>
            </div>

            <aside
              aria-label="Key benefits"
              className="border-t border-slate-300/80 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
            >
              <ul className="space-y-8">
                {benefits.map((benefit, index) => (
                  <li key={benefit.title} className="max-w-sm">
                    <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">
                      0{index + 1}
                    </p>
                    <h2 className="mt-2 text-base font-semibold text-slate-900">
                      {benefit.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {benefit.description}
                    </p>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section
          aria-labelledby="how-it-works-heading"
          className="border-t border-slate-200 py-16 sm:py-20"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              How it works
            </p>
            <h2
              id="how-it-works-heading"
              className="mt-4 text-3xl font-medium leading-tight tracking-[-0.03em] text-slate-950 sm:text-4xl"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              A simple rhythm for your finances.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              From setup to forecasting, SamonaFlow keeps the essentials in one
              place so you can focus on running the business.
            </p>
          </div>

          <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8 lg:gap-12">
            {steps.map((step) => (
              <li key={step.number} className="border-t border-slate-200 pt-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">
                  {step.number}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="cta-heading"
          className="border-t border-slate-200 py-16 sm:py-24"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Get started
            </p>
            <h2
              id="cta-heading"
              className="mt-4 text-3xl font-medium leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Ready for a clearer view of cash flow?
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Bring invoices, payments, expenses, and forecasts into one calm
              workspace. Start simple, stay informed, and plan with confidence.
            </p>
            <div className="mt-8">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-900 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
              >
                Create your workspace
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200/80 py-6 text-sm text-slate-500">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>SamonaFlow</p>
            <p>Simple financial clarity for independent work.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
