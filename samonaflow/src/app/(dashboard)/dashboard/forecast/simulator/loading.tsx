function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

export default function ForecastSimulatorLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12"
      aria-busy="true"
      aria-label="Loading what-if cash flow simulator"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Block className="h-4 w-40" />
          <Block className="mt-3 h-8 w-80" />
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
          <Block key={index} className="h-28 w-full" />
        ))}
      </div>

      <Block className="h-72 w-full" />
      <Block className="h-64 w-full" />
    </div>
  );
}
