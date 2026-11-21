function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Block className="h-8 w-56" />
        <div className="flex flex-wrap gap-2">
          <Block className="h-8 w-24" />
          <Block className="h-8 w-24" />
          <Block className="h-8 w-24" />
          <Block className="h-8 w-28" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <Block className="h-4 w-32" />
            <Block className="mt-3 h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <Block className="mb-4 h-5 w-24" />
        <Block className="h-72 w-full" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <Block className="mb-4 h-5 w-40" />
            <div className="space-y-3">
              <Block className="h-8 w-full" />
              <Block className="h-8 w-full" />
              <Block className="h-8 w-full" />
              <Block className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
