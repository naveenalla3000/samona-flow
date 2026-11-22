"use client";

import { useEffect } from "react";

export default function InvoicesError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold">Invoices</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        We couldn&apos;t load invoices right now. Please try again.
      </div>
      <button
        type="button"
        onClick={retry}
        className="mt-4 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        Try again
      </button>
    </main>
  );
}
