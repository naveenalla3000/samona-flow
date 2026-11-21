export default function InvoicesLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-4 h-4 w-72 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
          />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
    </main>
  );
}
