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
    <div className="flex flex-col items-start gap-3 p-6">
      <h2 className="text-lg font-semibold text-gray-900">We could not load the dashboard.</h2>
      <p className="text-sm text-gray-600">Something went wrong while loading your financial data. Please try again.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Retry
      </button>
    </div>
  );
}
