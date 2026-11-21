import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/require-auth";

// Session verification is request-time data and cannot be prerendered.
export const instant = false;

export default async function DashboardPage() {
  // Server-side verification: unauthenticated visitors never see this page.
  const user = await requireUser();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>
      <p className="mt-6 text-sm text-neutral-500">
        Signed in as <span className="font-medium text-neutral-900 dark:text-neutral-100">{user.email}</span>.
      </p>
    </main>
  );
}
