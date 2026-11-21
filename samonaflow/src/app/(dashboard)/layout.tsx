import Link from "next/link";
import { redirect } from "next/navigation";
import { BusinessSwitcher } from "@/components/business/business-switcher";
import { DashboardNav } from "@/components/business/dashboard-nav";
import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/require-auth";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { businessService } from "@/server/services/business-service";

// The shell reads the session and the active business on every request.
export const instant = false;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const businesses = await businessService.list(user);

  if (businesses.length === 0) {
    redirect("/onboarding");
  }

  const resolved = await resolveCurrentBusiness(user);
  const activeBusiness =
    businesses.find((business) => resolved.ok && business.id === resolved.businessId) ??
    businesses[0];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-900 focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-900"
            >
              samonaflow
            </Link>
            <span aria-hidden="true" className="hidden h-6 w-px bg-slate-200 sm:block" />
            <BusinessSwitcher
              businesses={businesses}
              activeBusinessId={activeBusiness?.id ?? ""}
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-xs text-slate-500 sm:inline">
              {user.email}
            </span>
            <Link
              href="/dashboard/settings"
              className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
            >
              Settings
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <DashboardNav />
        </div>
      </header>

      <div id="main-content" className="flex-1">
        {children}
      </div>
    </div>
  );
}
