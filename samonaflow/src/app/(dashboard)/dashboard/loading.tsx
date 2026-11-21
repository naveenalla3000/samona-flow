function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

function Panel() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Block className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        <Block className="h-9 w-full" />
        <Block className="h-9 w-full" />
        <Block className="h-9 w-full" />
        <Block className="h-9 w-full" />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <main className="min-h-full bg-slate-50">
      <div
        className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8"
        aria-busy="true"
        aria-label="Loading dashboard"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Block className="h-3 w-24" />
            <Block className="mt-3 h-9 w-64" />
            <Block className="mt-2 h-4 w-72" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Block className="h-10 w-28" />
            <Block className="h-10 w-28" />
            <Block className="h-10 w-28" />
            <Block className="h-10 w-28" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <Block className="h-3 w-32" />
              <Block className="mt-4 h-8 w-40" />
              <Block className="mt-2 h-3 w-48" />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Block className="h-5 w-48" />
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Block key={index} className="h-20 w-full" />
            ))}
          </div>
          <Block className="mt-4 h-80 w-full" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Block className="h-5 w-32" />
          <div className="mt-4 space-y-3">
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel />
          <Panel />
        </div>

        <Panel />
      </div>
    </main>
  );
}
