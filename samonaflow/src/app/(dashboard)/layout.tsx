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

  if (user) {
    const current = await resolveCurrentBusiness(user);
    if (current.ok) {
      try {
        const business = await businessService.get(user, current.businessId);
        businessName = business.name;
      } catch {
        // Keep fallback label if business lookup fails.
      }
    }
  }

  return (
    <div className="min-h-full bg-white text-slate-900">
      <DashboardNav businessName={businessName} />
      <div className="min-w-0 lg:pl-64">{children}</div>
    </div>
  );
}
