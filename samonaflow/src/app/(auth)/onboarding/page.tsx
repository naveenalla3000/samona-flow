import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/require-auth";
import { businessService } from "@/server/services/business-service";
import { BusinessOnboardingForm } from "@/components/business/business-onboarding-form";

export const instant = false;

export default async function OnboardingPage() {
  await connection();
  const user = await requireUser();
  const memberships = await businessService.list(user);

  if (memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen w-full bg-white px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1100px] items-center sm:min-h-[calc(100vh-4rem)]">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-24px_rgba(15,23,42,0.18)] lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
          <section className="relative flex flex-col justify-between border-b border-slate-200/80 bg-white px-6 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">
                samona<span className="text-brand-700">Flow</span>
              </p>
              <p className="mt-10 text-sm font-medium text-brand-700">Business setup</p>
              <h1 className="mt-3 max-w-sm text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Set up your business workspace
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600 sm:text-base">
                Add the essentials for invoicing, cash flow, and reporting. You can update these details
                later from settings.
              </p>
            </div>

            <div aria-hidden="true" className="mt-10 hidden lg:block">
              <div className="relative h-52 rounded-2xl border border-slate-200 bg-white/80 p-5">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-100/70 blur-2xl" />
                <div className="space-y-3">
                  <div className="h-2.5 w-24 rounded-full bg-slate-200" />
                  <div className="h-10 rounded-xl border border-slate-200 bg-white" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-10 rounded-xl border border-slate-200 bg-white" />
                    <div className="h-10 rounded-xl border border-slate-200 bg-white" />
                  </div>
                  <div className="h-10 rounded-xl border border-brand-200 bg-brand-50/70" />
                </div>
              </div>
            </div>
          </section>

          <section className="px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
            <div className="mx-auto w-full max-w-[650px]">
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900">Business details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  We&apos;ll use this to create your workspace and set your default currency.
                </p>
              </div>
              <BusinessOnboardingForm defaultEmail={user.email} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
