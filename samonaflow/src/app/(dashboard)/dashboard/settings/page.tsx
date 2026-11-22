import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { BusinessForm } from "@/components/business/business-form";
import { updateBusinessAction } from "@/server/actions/business-actions";
import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/require-auth";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { businessService } from "@/server/services/business-service";
import type { BusinessFormValues } from "@/types/business-form";

export const instant = false;

export const metadata: Metadata = {
  title: "Business settings",
};

export default async function BusinessSettingsPage() {
  await connection();
  const user = await requireUser();
  const current = await resolveCurrentBusiness(user);
  if (!current.ok) {
    redirect("/onboarding");
  }

  const business = await businessService.get(user, current.businessId);

  const defaultValues: BusinessFormValues = {
    name: business.name,
    ownerName: business.ownerName,
    email: business.email,
    phone: business.phone ?? "",
    businessType: business.businessType,
    currency: business.currency,
    timezone: business.timezone,
    openingBalance: business.openingBalance,
    openingBalanceDate: business.openingBalanceDate,
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Business settings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Profile, currency, timezone and opening cash position for {business.name}.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
          {business.role}
        </span>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <section
            aria-labelledby="account-heading"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="account-heading" className="text-base font-semibold text-slate-900">
                  Account
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Signed in as{" "}
                  <span className="font-medium text-slate-900">{user.email}</span>.
                </p>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                >
                  Sign out
                </button>
              </form>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {business.role === "OWNER" ? (
              <BusinessForm
                mode="update"
                submitLabel="Save settings"
                defaultValues={defaultValues}
                action={updateBusinessAction}
                cancelHref="/dashboard"
              />
            ) : (
              <div>
                <h2 className="text-base font-semibold text-slate-900">Read-only access</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Only the business owner can change these settings. You can still use the business
                  modules allowed by your membership.
                </p>
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Business name</dt>
                    <dd className="mt-1 text-sm text-slate-900">{business.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Currency</dt>
                    <dd className="mt-1 text-sm text-slate-900">{business.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Timezone</dt>
                    <dd className="mt-1 text-sm text-slate-900">{business.timezone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Opening balance</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {business.currency} {business.openingBalance}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <h2 className="font-semibold text-slate-900">How settings affect the numbers</h2>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li>Invoices snapshot the business currency at creation.</li>
              <li>Expenses have no currency column and use the business currency.</li>
              <li>Overdue dates use the business timezone, not the server clock.</li>
              <li>The opening balance is a manual starting position, not a bank balance.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="font-semibold">Currency is locked after activity</h2>
            <p className="mt-2">
              Once an invoice, payment or expense exists, the currency cannot be changed because it
              would reinterpret historical amounts. Create a separate business workspace instead.
            </p>
          </div>


        </aside>
      </div>
    </main>
  );
}
