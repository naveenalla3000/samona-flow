"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  ChevronsUpDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavItemActive,
  type DashboardNavItem,
} from "@/lib/dashboard/navigation";

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/customers": Users,
  "/dashboard/invoices": FileText,
  "/dashboard/payments": CreditCard,
  "/dashboard/expenses": Receipt,
  "/dashboard/reminders": BellRing,
  "/dashboard/forecast": TrendingUp,
  "/dashboard/forecast/simulator": SlidersHorizontal,
  "/dashboard/alerts": AlertTriangle,
  "/dashboard/settings": Settings,
};

const NAV_GROUPS: Array<{ label: string; hrefs: string[] }> = [
  {
    label: "Platform",
    hrefs: [
      "/dashboard",
      "/dashboard/customers",
      "/dashboard/invoices",
      "/dashboard/payments",
      "/dashboard/expenses",
    ],
  },
  {
    label: "Planning",
    hrefs: [
      "/dashboard/reminders",
      "/dashboard/forecast",
      "/dashboard/forecast/simulator",
      "/dashboard/alerts",
    ],
  },
];

function groupItems(hrefs: string[]): DashboardNavItem[] {
  return hrefs
    .map((href) => DASHBOARD_NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is DashboardNavItem => Boolean(item));
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {groupItems(group.hrefs).map((item) => {
              const active = isDashboardNavItemActive(pathname, item);
              const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${
                      active
                        ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/5"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`size-4 shrink-0 ${
                        active ? "text-cyan-400" : "text-zinc-500 group-hover:text-zinc-300"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WorkspaceCard({
  businessName,
  currency,
  initial,
}: {
  businessName: string;
  currency: string;
  initial: string;
}) {
  return (
    <Link
      href="/dashboard/settings"
      className="mx-3 mt-4 flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600 text-xs font-bold text-white">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{businessName}</span>
        <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          {currency} · Workspace
        </span>
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />
    </Link>
  );
}

function ForecastCard({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="mx-3 mb-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-white">
        <span className="grid size-6 place-items-center rounded-md bg-cyan-400/10 text-cyan-400">
          <TrendingUp className="size-3.5" aria-hidden="true" />
        </span>
        Cash flow forecast
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
        Review projected balances before committing to new spend.
      </p>
      <Link
        href="/dashboard/forecast"
        onClick={onNavigate}
        className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        Open forecast
        <ArrowRight className="size-3" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ShellFooter({ businessName }: { businessName: string }) {
  return (
    <div className="border-t border-zinc-800 px-3 py-3">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
          {businessName.trim().charAt(0).toUpperCase() || "S"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-zinc-200">{businessName}</span>
          <span className="block text-[10px] text-zinc-500">Financial workspace</span>
        </span>
        <Settings className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function DashboardNav({
  businessName = "SamonaFlow",
  currency = "USD",
}: {
  businessName?: string;
  currency?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = businessName.trim().charAt(0).toUpperCase() || "S";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-zinc-950 lg:flex">
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-950">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">SamonaFlow</span>
          </Link>
          <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Finance
          </span>
        </div>

        <WorkspaceCard businessName={businessName} currency={currency} initial={initial} />

        <nav aria-label="Primary" className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks pathname={pathname} />
        </nav>

        <ForecastCard />
        <ShellFooter businessName={businessName} />
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between bg-zinc-950 px-4 py-3 lg:hidden">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-950">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-white">SamonaFlow</span>
        </Link>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-zinc-950">
            <div className="flex h-16 items-center justify-between px-4">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-950">
                  <Wallet className="size-4" aria-hidden="true" />
                </span>
                <span className="truncate text-sm font-semibold tracking-tight text-white">
                  SamonaFlow
                </span>
              </Link>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <WorkspaceCard businessName={businessName} currency={currency} initial={initial} />

            <nav aria-label="Primary mobile" className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>

            <ForecastCard onNavigate={() => setOpen(false)} />
            <ShellFooter businessName={businessName} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
