"use client";

import { useEffect } from "react";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-full bg-white px-4 py-16">
      <div className="mx-auto w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          We could not load the dashboard.
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Something went wrong while loading your financial data. No records were changed.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
