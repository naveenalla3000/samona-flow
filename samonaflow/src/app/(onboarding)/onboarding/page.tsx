import Link from "next/link";
import type { Metadata } from "next";
import { BusinessForm } from "@/components/business/business-form";
import { businessLocalDate } from "@/lib/business-date";
import { createBusinessAction } from "@/server/actions/business-actions";
import { requireUser } from "@/server/auth/require-auth";
import { businessService } from "@/server/services/business-service";
import type { BusinessFormValues } from "@/types/business-form";

export const instant = false;

export const metadata: Metadata = {
  title: "Set up your business",
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const businesses = await businessService.list(user);
  const isFirstBusiness = businesses.length === 0;

  const defaultValues: BusinessFormValues = {
    name: "",
    ownerName: "",
    email: user.email,
    phone: "",
    businessType: "Freelancer",
    currency: "INR",
    timezone: "Asia/Kolkata",
    openingBalance: "0.00",
    openingBalanceDate: businessLocalDate("Asia/Kolkata"),
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">
        {isFirstBusiness ? "Welcome to SamonaFlow" : "Business setup"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
        {isFirstBusiness ? "Set up your business" : "Add another business"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        {isFirstBusiness
          ? "Create your business profile to start managing customers, invoices, payments, expenses and cash flow. You can change these settings later."
          : "Create a separate workspace with its own customers, invoices and financial records. You can switch between businesses from the dashboard header."}
      </p>

      {!isFirstBusiness ? (
        <p className="mt-4 text-sm">
          <Link
            href="/dashboard"
            className="font-medium text-blue-800 underline underline-offset-4 hover:text-blue-900"
          >
            ← Back to the dashboard
          </Link>
        </p>
      ) : null}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <BusinessForm
          mode="create"
          submitLabel={isFirstBusiness ? "Create business" : "Create business"}
          defaultValues={defaultValues}
          action={createBusinessAction}
          cancelHref={isFirstBusiness ? undefined : "/dashboard"}
        />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Your business data is isolated from every other business. The active business is stored in
        a secure cookie and re-checked against your membership on every request.
      </p>
    </div>
  );
}
