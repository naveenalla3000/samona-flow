import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-block text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900"
        >
          samonaflow
        </Link>
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
