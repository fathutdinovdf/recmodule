import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-label="Загрузка файлов">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-4 w-80 max-w-2/3" />
        <Skeleton className="h-4 w-16" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-52 max-w-2/3" />
            <Skeleton className="h-3 w-72 max-w-4/5" />
          </div>
          <Skeleton className="h-6 w-32 rounded-md" />
        </div>
      ))}
    </div>
  );
}
