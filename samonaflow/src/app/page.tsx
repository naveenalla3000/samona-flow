import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  LineChart,
  Menu,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

export const metadata: Metadata = {
  title: "SamonaFlow — Cash flow clarity for independent businesses",
  description:
    "Track invoices, payments, expenses, and forecasts in one calm workspace built for freelancers and independent professionals.",
};

const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10";

const PRIMARY_LINK =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950";

const SECONDARY_LINK =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 shadow-sm transition-colors hover:border-neutral-400 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
] as const;

const ROLES = [
  "Freelancers",
  "Design studios",
  "Agencies",
  "Consultants",
  "Contractors",
  "Small teams",
] as const;

const BENEFITS = [
  {
    icon: Wallet,
    title: "Cash position",
    description:
      "Opening balance, payments received, and paid expenses combine into one clear number you can trust.",
  },
  {
    icon: CalendarClock,
    title: "Receivables",
    description:
      "See what is outstanding, what is overdue, and which invoices are only partially paid.",
  },
  {
    icon: LineChart,
    title: "Forecast",
    description:
      "Project your balance with expected payment dates, unpaid expenses, and what-if scenarios.",
  },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Set up your workspace",
    description:
      "Add your business details, currency, and opening balance so every number starts from a clear baseline.",
  },
  {
    number: "02",
    title: "Track money in motion",
    description:
      "Create invoices, record full or partial payments, and log expenses as they happen.",
  },
  {
    number: "03",
    title: "Plan before it is urgent",
    description:
      "Use the forecast, reminders, and smart alerts to act on what is coming, not what already happened.",
  },
] as const;

const FAQS = [
  {
    question: "Do I need a credit card to get started?",
    answer:
      "No. Create an account, set up your business, and start tracking invoices, payments, and expenses right away.",
  },
  {
    question: "What can I manage in SamonaFlow?",
    answer:
      "Customers, invoices, payments, expenses, reminders, cash-flow forecasts, what-if scenarios, and smart alerts — all in one workspace.",
  },
  {
    question: "How does the cash-flow forecast work?",
    answer:
      "The forecast combines your opening balance, recorded payments, outstanding invoices with their expected payment dates, and upcoming expenses. Everything is calculated on the server so the dashboard and forecast always agree.",
  },
  {
    question: "Can I record partial payments?",
    answer:
      "Yes. Record any payment amount against an invoice and SamonaFlow tracks the remaining outstanding balance and updates the invoice status automatically.",
  },
  {
    question: "Which currency does SamonaFlow use?",
    answer:
      "You choose your business currency during setup. It is used consistently across invoices, payments, expenses, forecasts, and dashboard totals.",
  },
  {
    question: "How do reminders work?",
    answer:
      "SamonaFlow drafts a reminder message from your invoice details. You can open it in WhatsApp as a click-to-chat link and mark it as sent once you have followed up.",
  },
] as const;

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={PRIMARY_LINK}>
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={SECONDARY_LINK}>
      {children}
    </Link>
  );
}

function Eyebrow({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
      {icon}
      {children}
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
            {icon}
          </span>
          <h3 className="text-base font-semibold tracking-tight text-neutral-950">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{description}</p>
      </div>
      <div className="flex-1 border-t border-neutral-100 bg-neutral-50/70 p-5">{children}</div>
    </article>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "amber" | "rose" | "emerald" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function DashboardPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the SamonaFlow dashboard: available cash, receivables, overdue invoices, a cash-flow chart, upcoming expenses, and alerts."
      className="relative mx-auto mt-14 w-full max-w-5xl"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-10 -bottom-6 h-24 rounded-[50%] bg-neutral-950/10 blur-3xl"
      />
      <div className="relative rounded-[1.75rem] border border-neutral-200 bg-gradient-to-b from-neutral-100 to-white p-2 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.45)] sm:p-3">
        <div className="overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white">
          <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
            <span className="mx-auto hidden rounded-md border border-neutral-200 bg-white px-3 py-0.5 text-[10px] text-neutral-400 sm:block">
              app.samonaflow.com/dashboard
            </span>
            <span className="hidden w-12 sm:block" aria-hidden="true" />
          </div>

          <div className="grid md:grid-cols-[160px_minmax(0,1fr)]">
            <aside className="hidden bg-neutral-950 p-4 md:block">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-white text-[10px] font-bold text-neutral-950">
                  S
                </span>
                <span className="text-xs font-semibold text-white">SamonaFlow</span>
              </div>

              <div className="mt-5 space-y-1 text-[11px]">
                <p className="rounded-md bg-white/10 px-2 py-1.5 font-medium text-white">
                  Overview
                </p>
                {["Customers", "Invoices", "Payments", "Expenses", "Cash flow", "Alerts"].map(
                  (item) => (
                    <p key={item} className="px-2 py-1.5 text-white/55">
                      {item}
                    </p>
                  ),
                )}
              </div>

              <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Available</p>
                <p className="mt-1 text-xs font-semibold text-white">INR 238,450</p>
              </div>
            </aside>

            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-neutral-400">Overview</p>
                  <p className="text-sm font-semibold text-neutral-950">This month</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[10px] font-medium text-neutral-600">
                    This month
                  </span>
                  <span className="rounded-full bg-neutral-950 px-2.5 py-1 text-[10px] font-medium text-white">
                    New invoice
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "Available", value: "INR 238,450", delta: "+12.4%" },
                  { label: "Receivables", value: "INR 184,000", delta: "6 open" },
                  { label: "Overdue", value: "INR 42,500", delta: "2 invoices" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-neutral-200 bg-white p-2.5"
                  >
                    <p className="truncate text-[9px] uppercase tracking-[0.1em] text-neutral-400">
                      {stat.label}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-semibold text-neutral-950 sm:text-xs">
                      {stat.value}
                    </p>
                    <p className="mt-0.5 text-[9px] text-neutral-400">{stat.delta}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                <div className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-neutral-700">Cash flow</p>
                    <span className="text-[9px] text-neutral-400">Jan – Jun</span>
                  </div>
                  <svg
                    viewBox="0 0 560 170"
                    preserveAspectRatio="none"
                    className="mt-3 h-24 w-full sm:h-28"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="hero-preview-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#06b6d4" stopOpacity="0.28" />
                        <stop offset="1" stopColor="#06b6d4" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[30, 70, 110, 150].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="560"
                        y2={y}
                        stroke="#f0f0f0"
                        strokeWidth="1"
                      />
                    ))}
                    <path
                      d="M0 132 C 50 126, 82 96, 122 100 S 190 64, 232 74 S 300 42, 342 54 S 412 28, 452 38 S 522 18, 560 24 L560 170 L0 170 Z"
                      fill="url(#hero-preview-fill)"
                    />
                    <path
                      d="M0 132 C 50 126, 82 96, 122 100 S 190 64, 232 74 S 300 42, 342 54 S 412 28, 452 38 S 522 18, 560 24"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="mt-1 flex justify-between text-[8px] text-neutral-400">
                    {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month) => (
                      <span key={month}>{month}</span>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-[11px] font-medium text-neutral-700">Upcoming</p>
                  <div className="mt-2 space-y-2">
                    {[
                      { name: "Studio rent", amount: "18,000", tone: "rose" as const },
                      { name: "Software", amount: "4,200", tone: "amber" as const },
                      { name: "Internet", amount: "1,499", tone: "neutral" as const },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-2">
                        <span className="truncate text-[9px] text-neutral-500">{item.name}</span>
                        <span className="shrink-0 text-[9px] font-medium text-neutral-800">
                          {item.amount}
                        </span>
                        <StatusPill tone={item.tone}>
                          {item.tone === "rose" ? "Due" : item.tone === "amber" ? "Soon" : "Later"}
                        </StatusPill>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-md bg-rose-50 p-2">
                    <p className="flex items-center gap-1 text-[9px] font-semibold text-rose-700">
                      <BellRing className="size-2.5" aria-hidden="true" />2 overdue invoices
                    </p>
                    <p className="mt-0.5 text-[8px] leading-4 text-rose-600/80">
                      Follow up with a reminder.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main id="top" className="flex-1 bg-white text-neutral-950">
      {/* Announcement */}
      <a
        href="#features"
        className="group flex items-center justify-center gap-2 bg-neutral-950 px-4 py-2.5 text-center text-[11px] font-medium text-white/85 transition-colors hover:text-white sm:text-xs"
      >
        <span className="grid size-4 place-items-center rounded-full bg-white/15">
          <Sparkles className="size-2.5" aria-hidden="true" />
        </span>
        <span>Cash-flow forecasting and smart alerts are here</span>
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </a>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/85 backdrop-blur-md">
        <div className={`${CONTAINER} flex h-16 items-center justify-between gap-4`}>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-neutral-950 text-sm font-bold text-white">
              S
            </span>
            <span className="text-[15px] font-semibold tracking-tight">SamonaFlow</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden min-h-9 items-center rounded-full border border-neutral-200 px-4 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="hidden min-h-9 items-center rounded-full bg-neutral-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 sm:inline-flex"
            >
              Get started
            </Link>

            <details className="relative md:hidden">
              <summary
                aria-label="Toggle navigation menu"
                className="grid size-10 cursor-pointer list-none place-items-center rounded-full border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 [&::-webkit-details-marker]:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl shadow-neutral-950/10">
                <nav aria-label="Mobile" className="flex flex-col">
                  {NAV_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      {link.label}
                    </a>
                  ))}
                </nav>
                <div className="mt-2 grid gap-2 border-t border-neutral-100 p-2 pt-3">
                  <Link
                    href="/login"
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-neutral-200 text-sm font-medium text-neutral-800"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-neutral-950 text-sm font-semibold text-white"
                  >
                    Get started
                  </Link>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="hero-heading">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(60%_55%_at_50%_0%,#f4f4f5_0%,rgba(255,255,255,0)_72%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[420px] h-[520px] opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_50%,black,transparent)] dither-dots"
        />

        <div className={`${CONTAINER} relative pt-14 sm:pt-20`}>
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Built for independent businesses
            </span>

            <h1
              id="hero-heading"
              className="mt-6 text-[clamp(2.6rem,6.6vw,5rem)] font-medium leading-[0.98] tracking-[-0.05em] text-neutral-950"
            >
              Cash flow clarity
              <span className="block text-neutral-400">for independent teams.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg">
              Track invoices, payments, expenses, and forecasts in one calm workspace — so you
              always know what is coming.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-neutral-600">
              {[
                { label: "Invoices", icon: FileText },
                { label: "Payments", icon: CreditCard },
                { label: "Forecast", icon: TrendingUp },
              ].map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 shadow-sm"
                >
                  <chip.icon className="size-3 text-neutral-400" aria-hidden="true" />
                  {chip.label}
                </span>
              ))}
            </div>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryLink href="/signup">
                Create free workspace
                <ArrowRight className="size-4" aria-hidden="true" />
              </PrimaryLink>
              <a href="#how-it-works" className={SECONDARY_LINK}>
                See how it works
              </a>
            </div>

            <p className="mt-4 text-xs text-neutral-500">
              No credit card required · Set up in minutes
            </p>
          </div>

          <DashboardPreview />
        </div>
      </section>

      {/* Roles strip */}
      <section aria-labelledby="roles-heading" className="border-b border-neutral-200 bg-white">
        <div className={`${CONTAINER} py-12 sm:py-14`}>
          <h2 id="roles-heading" className="text-center text-xs font-medium text-neutral-400">
            One workspace for the way independent businesses work
          </h2>
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
            {ROLES.map((role) => (
              <li
                key={role}
                className="text-sm font-semibold tracking-tight text-neutral-400 sm:text-base"
              >
                {role}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Product metrics */}
      <section id="product" aria-labelledby="product-heading" className="bg-neutral-50/70">
        <div className={`${CONTAINER} py-20 sm:py-24`}>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow icon={<Wallet className="size-3.5 text-neutral-400" aria-hidden="true" />}>
              Your money, explained
            </Eyebrow>
            <h2
              id="product-heading"
              className="mt-5 text-3xl font-medium leading-tight tracking-[-0.035em] text-neutral-950 sm:text-[2.75rem]"
            >
              Understand your money,
              <span className="text-neutral-400"> without the spreadsheet.</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-neutral-600">
              We turn invoices, payments, and expenses into the few numbers that actually help you
              decide what to do next.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              {BENEFITS.map((benefit, index) => (
                <div
                  key={benefit.title}
                  className={`p-6 ${index === 0 ? "" : "border-t border-neutral-100"}`}
                >
                  <div className="flex items-center gap-2">
                    <benefit.icon className="size-4 text-neutral-400" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-neutral-950">{benefit.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{benefit.description}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">Cash-flow forecast</p>
                  <p className="mt-0.5 text-xs text-neutral-500">Next 90 days · INR</p>
                </div>
                <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600">
                  90 days
                </span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                    Projected balance
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                    INR 312,000
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <TrendingUp className="size-3" aria-hidden="true" />
                  +18.2%
                </span>
              </div>

              <div className="mt-6 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
                <svg
                  viewBox="0 0 640 200"
                  preserveAspectRatio="none"
                  className="h-36 w-full sm:h-44"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="forecast-preview-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop stopColor="#2563eb" stopOpacity="0.22" />
                      <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[30, 75, 120, 165].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="640"
                      y2={y}
                      stroke="#e8e8e8"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d="M0 150 C 60 146, 90 120, 140 126 S 220 92, 270 104 S 350 74, 400 82 S 480 52, 540 58 S 610 34, 640 38 L640 200 L0 200 Z"
                    fill="url(#forecast-preview-fill)"
                  />
                  <path
                    d="M0 150 C 60 146, 90 120, 140 126 S 220 92, 270 104 S 350 74, 400 82 S 480 52, 540 58 S 610 34, 640 38"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0 158 C 70 154, 110 142, 160 146 S 250 128, 300 134 S 390 112, 440 118 S 520 96, 580 100 S 620 88, 640 90"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                  <span>Today</span>
                  <span>30 days</span>
                  <span>60 days</span>
                  <span>90 days</span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  {
                    icon: BellRing,
                    title: "Overdue invoice",
                    detail: "INV-2026-018 · 12 days",
                    tone: "text-rose-600 bg-rose-50",
                  },
                  {
                    icon: Receipt,
                    title: "Rent due soon",
                    detail: "18,000 · in 4 days",
                    tone: "text-amber-600 bg-amber-50",
                  },
                  {
                    icon: ShieldCheck,
                    title: "No shortage",
                    detail: "Buffer stays positive",
                    tone: "text-emerald-600 bg-emerald-50",
                  },
                ].map((alert) => (
                  <div
                    key={alert.title}
                    className="flex items-start gap-2.5 rounded-xl border border-neutral-100 bg-white p-3"
                  >
                    <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${alert.tone}`}>
                      <alert.icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-neutral-900">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-neutral-500">{alert.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-heading" className="bg-white">
        <div className={`${CONTAINER} py-20 sm:py-24`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
            <div>
              <Eyebrow icon={<Sparkles className="size-3.5 text-neutral-400" aria-hidden="true" />}>
                Key features
              </Eyebrow>
              <h2
                id="features-heading"
                className="mt-5 text-3xl font-medium leading-tight tracking-[-0.035em] text-neutral-950 sm:text-[2.75rem]"
              >
                Everything you need to
                <span className="text-neutral-400"> run the money side.</span>
              </h2>
            </div>
            <p className="text-base leading-7 text-neutral-600">
              Purpose-built for small independent businesses: no bloated accounting suite, just the
              workflow you use every week.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <FeatureCard
              icon={<FileText className="size-4" aria-hidden="true" />}
              title="Invoices"
              description="Create, send, and track invoices with due dates, line items, and automatic outstanding balances."
            >
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-neutral-100 px-3 py-2 text-[9px] font-medium uppercase tracking-[0.1em] text-neutral-400">
                  <span>Invoice</span>
                  <span>Due</span>
                  <span>Status</span>
                </div>
                {[
                  { id: "INV-2026-018", due: "12d late", status: "Overdue", tone: "rose" as const },
                  { id: "INV-2026-021", due: "In 4d", status: "Sent", tone: "neutral" as const },
                  { id: "INV-2026-017", due: "Paid", status: "Paid", tone: "emerald" as const },
                ].map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-neutral-50 px-3 py-2 text-[10px] last:border-0"
                  >
                    <span className="truncate font-medium text-neutral-800">{row.id}</span>
                    <span className="text-neutral-400">{row.due}</span>
                    <StatusPill tone={row.tone}>{row.status}</StatusPill>
                  </div>
                ))}
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<CreditCard className="size-4" aria-hidden="true" />}
              title="Payments"
              description="Record full or partial payments by UPI, bank transfer, cash, or other methods — balances update instantly."
            >
              <div className="space-y-2">
                {[
                  { name: "Aarti Mehta", method: "UPI", amount: "INR 45,000" },
                  { name: "Bluepeak Studio", method: "Bank transfer", amount: "INR 80,000" },
                ].map((payment) => (
                  <div
                    key={payment.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-neutral-900">
                        {payment.name}
                      </p>
                      <p className="mt-0.5 text-[9px] text-neutral-400">{payment.method}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-neutral-900">{payment.amount}</p>
                      <p className="mt-0.5 text-[9px] text-emerald-600">Recorded</p>
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-center text-[10px] text-neutral-400">
                  Partial payments keep the remaining balance visible.
                </p>
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<Users className="size-4" aria-hidden="true" />}
              title="Customers"
              description="Keep contact details, company information, and every invoice in one place for each client."
            >
              <div className="space-y-2">
                {[
                  { initial: "A", name: "Aarti Mehta", detail: "2 open invoices", amount: "INR 42,500" },
                  { initial: "B", name: "Bluepeak Studio", detail: "Paid on time", amount: "INR 0" },
                ].map((customer) => (
                  <div
                    key={customer.name}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-950 text-[10px] font-semibold text-white">
                      {customer.initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-neutral-900">
                        {customer.name}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-neutral-400">{customer.detail}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-neutral-800">
                      {customer.amount}
                    </span>
                  </div>
                ))}
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<Receipt className="size-4" aria-hidden="true" />}
              title="Expenses"
              description="Log upcoming and paid expenses by category so cash out never gets forgotten."
            >
              <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
                {[
                  { label: "Rent", amount: 18000, width: "88%", tone: "bg-neutral-900" },
                  { label: "Software", amount: 4200, width: "38%", tone: "bg-neutral-500" },
                  { label: "Internet", amount: 1499, width: "18%", tone: "bg-neutral-300" },
                ].map((expense) => (
                  <div key={expense.label}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-medium text-neutral-700">{expense.label}</span>
                      <span className="tabular-nums text-neutral-500">{expense.amount}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={`h-full rounded-full ${expense.tone}`}
                        style={{ width: expense.width }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<BellRing className="size-4" aria-hidden="true" />}
              title="Reminders"
              description="Draft a polite follow-up from the invoice, open it in WhatsApp, and mark it as sent when you are done."
            >
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <p className="text-[10px] font-medium text-neutral-400">Reminder draft</p>
                <p className="mt-2 rounded-lg rounded-tl-sm bg-neutral-100 p-2.5 text-[10px] leading-5 text-neutral-700">
                  Hi Aarti, a quick reminder that invoice INV-2026-018 for INR 42,500 is now 12
                  days overdue.
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[9px] text-neutral-400">WhatsApp click-to-chat</span>
                  <StatusPill tone="amber">Marked sent</StatusPill>
                </div>
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<TrendingUp className="size-4" aria-hidden="true" />}
              title="Forecast & what-if"
              description="Project your balance, then test decisions like hiring or a late payment before you commit."
            >
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <svg
                  viewBox="0 0 400 120"
                  preserveAspectRatio="none"
                  className="h-20 w-full"
                  aria-hidden="true"
                >
                  {[24, 56, 88].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="400"
                      y2={y}
                      stroke="#f0f0f0"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d="M0 92 C 40 88, 70 72, 110 78 S 170 54, 210 62 S 280 44, 320 48 S 370 30, 400 34"
                    fill="none"
                    stroke="#18181b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0 98 C 50 94, 80 86, 120 90 S 180 76, 220 80 S 290 66, 330 70 S 380 58, 400 60"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="mt-1 flex items-center gap-4 text-[9px] text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-0.5 w-4 rounded bg-neutral-900" /> Base plan
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-0.5 w-4 rounded bg-neutral-400" /> What-if
                  </span>
                </div>
              </div>
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-it-works-heading" className="bg-neutral-50/70">
        <div className={`${CONTAINER} py-20 sm:py-24`}>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow icon={<Check className="size-3.5 text-neutral-400" aria-hidden="true" />}>
              How it works
            </Eyebrow>
            <h2
              id="how-it-works-heading"
              className="mt-5 text-3xl font-medium leading-tight tracking-[-0.035em] text-neutral-950 sm:text-[2.75rem]"
            >
              A simple rhythm
              <span className="text-neutral-400"> for your finances.</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-neutral-600">
              From setup to forecasting, the essentials stay in one place so you can focus on the
              work that pays.
            </p>
          </div>

          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.number}
                className="rounded-2xl border border-neutral-200 bg-white p-6"
              >
                <span className="grid size-9 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
                  {step.number}
                </span>
                <h3 className="mt-5 text-base font-semibold tracking-tight text-neutral-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryLink href="/signup">
              Create your workspace
              <ArrowRight className="size-4" aria-hidden="true" />
            </PrimaryLink>
            <Link
              href="/login"
              className="text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-950 hover:underline"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Statement */}
      <section aria-labelledby="statement-heading" className="bg-white">
        <div className={`${CONTAINER} py-20 sm:py-24`}>
          <div className="grid gap-10 rounded-3xl border border-neutral-200 bg-neutral-50/60 p-8 sm:p-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div>
              <Eyebrow icon={<ShieldCheck className="size-3.5 text-neutral-400" aria-hidden="true" />}>
                Why SamonaFlow
              </Eyebrow>
              <h2
                id="statement-heading"
                className="mt-5 max-w-2xl text-2xl font-medium leading-snug tracking-[-0.03em] text-neutral-950 sm:text-3xl"
              >
                “We built SamonaFlow around one question: what do I need to know about my money
                today?”
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-neutral-600">
                Every number is calculated on the server from your invoices, active payments, and
                expenses — so the dashboard, forecast, and alerts always tell the same story.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-neutral-950 text-xs font-bold text-white">
                  S
                </span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">The SamonaFlow team</p>
                  <p className="text-xs text-neutral-500">Built for independent businesses</p>
                </div>
              </div>
            </div>

            <ul className="space-y-4">
              {[
                "Outstanding balances update from real recorded payments.",
                "Partial payments and reversals are handled without losing history.",
                "Forecasts use expected payment dates and unpaid expenses.",
                "Alerts only fire from conditions in your actual data.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-6 text-neutral-700">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-heading" className="border-t border-neutral-200 bg-white">
        <div className={`${CONTAINER} py-20 sm:py-24`}>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow icon={<ChevronDown className="size-3.5 text-neutral-400" aria-hidden="true" />}>
              FAQs
            </Eyebrow>
            <h2
              id="faq-heading"
              className="mt-5 text-3xl font-medium leading-tight tracking-[-0.035em] text-neutral-950 sm:text-[2.75rem]"
            >
              Questions,
              <span className="text-neutral-400"> answered.</span>
            </h2>
          </div>

          <div className="mx-auto mt-10 max-w-3xl divide-y divide-neutral-200 border-y border-neutral-200">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-sm font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronDown
                    className="size-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="pb-5 pr-8 text-sm leading-6 text-neutral-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-heading" className="bg-white">
        <div className={`${CONTAINER} pb-20 sm:pb-24`}>
          <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-16 text-center sm:px-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)] dither-dots"
            />
            <div className="relative mx-auto max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Start with a clear baseline
              </span>
              <h2
                id="cta-heading"
                className="mt-5 text-3xl font-medium leading-tight tracking-[-0.04em] text-neutral-950 sm:text-5xl"
              >
                Ready for a clearer view
                <span className="block text-neutral-400">of your cash flow?</span>
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-neutral-600">
                Bring invoices, payments, expenses, and forecasts into one calm workspace. Start
                simple, stay informed, and plan with confidence.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <PrimaryLink href="/signup">
                  Create free workspace
                  <ArrowRight className="size-4" aria-hidden="true" />
                </PrimaryLink>
                <SecondaryLink href="/login">
                  Sign in
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </SecondaryLink>
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                No credit card required · Your data stays yours
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white">
        <div className={`${CONTAINER} py-12`}>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="max-w-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-neutral-950 text-sm font-bold text-white">
                  S
                </span>
                <span className="text-[15px] font-semibold tracking-tight">SamonaFlow</span>
              </Link>
              <p className="mt-4 text-sm leading-6 text-neutral-500">
                Cash flow clarity for freelancers and independent businesses. Invoices, payments,
                expenses, and forecasts in one calm workspace.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Product
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-neutral-600 transition-colors hover:text-neutral-950"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Account
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link
                    href="/signup"
                    className="text-neutral-600 transition-colors hover:text-neutral-950"
                  >
                    Create account
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="text-neutral-600 transition-colors hover:text-neutral-950"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/forgot-password"
                    className="text-neutral-600 transition-colors hover:text-neutral-950"
                  >
                    Forgot password
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 SamonaFlow. All rights reserved.</p>
            <p>Simple financial clarity for independent work.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
