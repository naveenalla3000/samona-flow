export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-6 h-32 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
      <div className="mt-6 h-64 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
    </main>
  );
}
