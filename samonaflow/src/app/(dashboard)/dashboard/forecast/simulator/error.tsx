"use client";

import { useEffect } from "react";

type ForecastSimulatorErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ForecastSimulatorError({ error, reset }: ForecastSimulatorErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h2 className="text-lg font-semibold">We could not load the what-if simulator.</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Something went wrong while loading the baseline forecast. Please try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Retry
      </button>
    </div>
  );
}
