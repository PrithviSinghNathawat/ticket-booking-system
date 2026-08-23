import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </main>
  );
}
