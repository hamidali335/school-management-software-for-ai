import React from 'react';
import { clsx } from 'clsx';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => (
  <div
    className={clsx('animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg', className)}
    {...props}
  />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
  <div className="space-y-3 p-4">
    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center space-x-4 py-2">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={clsx('h-3.5', c === 0 ? 'w-24' : 'flex-1')} />
        ))}
      </div>
    ))}
  </div>
);

export const CardSkeleton: React.FC = () => (
  <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="w-8 h-8 rounded-xl" />
    </div>
    <Skeleton className="h-7 w-20" />
    <Skeleton className="h-3 w-40" />
  </div>
);
