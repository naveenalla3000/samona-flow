"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      data-print-hide
      onClick={() => window.print()}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900"
    >
      Print / Save as PDF
    </button>
  );
}
