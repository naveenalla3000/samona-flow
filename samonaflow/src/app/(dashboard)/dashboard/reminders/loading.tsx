export default function RemindersLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-4 h-4 w-80 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
      <div className="mt-8 h-48 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
      <div className="mt-6 h-64 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
    </main>
  );
}
