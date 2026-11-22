import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <DashboardNav />
      <div className="min-w-0 lg:pl-64">{children}</div>
    </div>
  );
}
