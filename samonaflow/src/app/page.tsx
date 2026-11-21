import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">samonaflow</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Financial management for freelancers and independent professionals.
      </p>
      <div className="flex gap-4 text-sm">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
