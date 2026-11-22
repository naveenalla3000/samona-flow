type PageLoaderProps = {
  label?: string;
  fullScreen?: boolean;
  className?: string;
};

export function PageLoader({
  label = "Loading...",
  fullScreen = false,
  className = "",
}: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={`flex flex-col items-center justify-center gap-3 bg-zinc-100 text-zinc-600 ${
        fullScreen ? "min-h-screen px-4 py-10 sm:px-6 sm:py-12" : "px-4 py-12 sm:px-6 sm:py-16"
      } ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"
      />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
