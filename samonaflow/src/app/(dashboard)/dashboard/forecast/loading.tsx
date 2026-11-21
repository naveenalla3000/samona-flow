function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

export default function ForecastLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12"
      aria-busy="true"
      aria-label="Loading cash flow forecast"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Block className="h-4 w-24" />
          <Block className="mt-3 h-8 w-64" />
          <Block className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Block className="h-10 w-24" />
          <Block className="h-10 w-24" />
          <Block className="h-10 w-24" />
        </div>
      </div>

      <Block className="h-16 w-full" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Block className="h-4 w-32" />
            <Block className="mt-3 h-6 w-24" />
            <Block className="mt-2 h-3 w-40" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <Block className="mb-4 h-5 w-48" />
        <Block className="h-80 w-full" />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <Block className="mb-4 h-5 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Block key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
