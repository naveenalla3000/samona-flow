"use client";

import { useEffect } from "react";

type ForecastErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ForecastError({ error, reset }: ForecastErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h2 className="text-lg font-semibold">We could not load the cash flow forecast.</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Something went wrong while calculating the projection. Please try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:text-white"
      >
        Retry
      </button>
    </div>
  );
}
