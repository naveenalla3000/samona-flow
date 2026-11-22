"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      data-print-hide
      onClick={() => window.print()}
      className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 dark:bg-blue-600 dark:text-white"
    >
      Print / Save as PDF
    </button>
  );
}
