export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--border-subtle)]/50 ${className}`} />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}

export function SeatMapSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-8 w-full max-w-md" />
      <div className="rounded-2xl bg-[var(--panel-dark)] p-6">
        <Skeleton className="mx-auto mb-6 h-6 w-48 bg-white/10" />
        <div className="flex flex-col items-center gap-2">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="flex gap-2">
              {Array.from({ length: 10 }).map((_, seat) => (
                <div key={seat} className="h-9 w-9 animate-pulse rounded-md bg-white/10" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
