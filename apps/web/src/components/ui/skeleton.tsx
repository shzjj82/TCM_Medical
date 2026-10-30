import { cn } from '../../lib/utils';

/** 加载占位：形状对齐真实内容，避免闪「加载中…」。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-100', className)} aria-hidden />;
}

export function PatientBriefSkeleton() {
  return (
    <div className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
      <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-52 max-w-full" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function PatientListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="加载中">
      {Array.from({ length: count }, (_, index) => <PatientBriefSkeleton key={index} />)}
    </div>
  );
}

export function KnowledgeCardSkeleton() {
  return (
    <div className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-3 w-28" />
      <Skeleton className="mt-3 h-3 w-48" />
    </div>
  );
}

export function KnowledgeListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="加载中">
      {Array.from({ length: count }, (_, index) => <KnowledgeCardSkeleton key={index} />)}
    </div>
  );
}

export function DashboardRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

export function DashboardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="加载中">
      {Array.from({ length: count }, (_, index) => <DashboardRowSkeleton key={index} />)}
    </div>
  );
}

export function PatientDetailSkeleton() {
  return (
    <div className="flex min-h-full flex-1 flex-col" role="status" aria-label="加载中">
      <div className="mb-3 hidden md:block">
        <Skeleton className="h-8 w-24" />
      </div>
      <PatientBriefSkeleton />
      <div className="mt-4 min-h-0 flex-1 md:rounded-2xl md:border md:border-slate-100 md:p-5">
        <div className="hidden gap-3 md:grid md:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="mt-4 flex gap-6">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function CaseDetailSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="加载中">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="flex gap-6 pt-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-3 pt-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ChatReplySkeleton() {
  return (
    <div className="mr-8 max-w-[min(100%,40rem)] rounded-2xl rounded-bl-md border border-slate-100 bg-white px-4 py-3 md:mr-16" role="status" aria-label="正在生成">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
