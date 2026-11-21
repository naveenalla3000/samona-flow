function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

export default function AlertsLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12"
      aria-busy="true"
      aria-label="Loading smart alerts"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Block className="h-4 w-24" />
          <Block className="mt-3 h-8 w-56" />
          <Block className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Block className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <Block className="h-3 w-16" />
            <Block className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Block key={index} className="h-10 w-full" />
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <Block className="h-4 w-32" />
            <Block className="mt-3 h-5 w-72 max-w-full" />
            <Block className="mt-2 h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
