"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/expenses", label: "Expenses" },
  { href: "/dashboard/reminders", label: "Reminders" },
  { href: "/dashboard/forecast", label: "Cash flow" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 ${
                active
                  ? "bg-blue-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardNav({ businessName = "SamonaFlow" }: { businessName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = businessName.trim().charAt(0).toUpperCase() || "S";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-slate-200/80 px-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">{initial}</span>
            <span className="truncate text-sm font-semibold tracking-tight text-slate-900">{businessName}</span>
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="border-t border-slate-200/80 px-5 py-4 text-xs text-slate-500">
          samonaFlow workspace
        </div>
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:hidden">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">{initial}</span>
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900">{businessName}</span>
        </Link>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" aria-hidden="true" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white">
            <div className="flex h-16 items-center justify-between border-b border-slate-200/80 px-5">
              <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">{initial}</span>
                <span className="truncate text-sm font-semibold tracking-tight text-slate-900">{businessName}</span>
              </Link>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Primary mobile" className="flex-1 overflow-y-auto px-3 py-4">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
