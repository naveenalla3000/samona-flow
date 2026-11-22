import type { ReactNode } from "react";
import { connection } from "next/server";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { getCurrentUser } from "@/server/auth/get-current-user";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { businessService } from "@/server/services/business-service";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await connection();
  const user = await getCurrentUser();
  let businessName = "SamonaFlow";
  let currency = "USD";

  if (user) {
    const current = await resolveCurrentBusiness(user);
    if (current.ok) {
      try {
        const business = await businessService.get(user, current.businessId);
        businessName = business.name;
        currency = business.currency;
      } catch {
        // Keep fallback labels if business lookup fails.
      }
    }
  }

  return (
    <div className="min-h-full bg-zinc-100 text-zinc-900">
      <DashboardNav businessName={businessName} currency={currency} />
      <div className="min-w-0 lg:pl-64">{children}</div>
    </div>
  );
}
