import React, { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (val: any, item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T, index: number) => string;
  isLoading?: boolean;
  loading?: boolean;
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
  className?: string;
  onRowClick?: (item: T) => void;
  pageSize?: number;
  disablePagination?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor = (item: any, i: number) => item?.id || String(i),
  isLoading,
  loading,
  emptyState,
  emptyMessage = 'No records found',
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  actions,
  className,
  onRowClick,
  pageSize = 50,
  disablePagination = false,
}: DataTableProps<T>) {
  const isTableLoading = Boolean(isLoading || loading);
  const [page, setPage] = useState(1);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [totalItems, searchValue]);

  const safePage = Math.min(page, totalPages);
  const paginatedData = useMemo(() => {
    if (disablePagination || totalItems <= pageSize) return data;
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, disablePagination, pageSize, safePage, totalItems]);

  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, totalItems);

  return (
    <div className={clsx('space-y-3', className)}>
      {(onSearchChange !== undefined || actions) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3">
          {onSearchChange !== undefined ? (
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchValue || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
          ) : <div />}
          {actions && <div className="flex items-center space-x-2 shrink-0">{actions}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider select-none">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={clsx(
                    'py-3 px-4 font-semibold',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isTableLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>Loading data from encrypted database...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  {emptyState || emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => (
                <tr
                  key={keyExtractor(item, (safePage - 1) * pageSize + index)}
                  onClick={() => onRowClick && onRowClick(item)}
                  className={clsx(
                    'transition-colors',
                    onRowClick ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/70' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={clsx(
                        'py-3 px-4',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                        col.className
                      )}
                    >
                      {col.render
                        ? col.render((item as any)[col.key], item, (safePage - 1) * pageSize + index)
                        : (item as any)[col.key] !== undefined && (item as any)[col.key] !== null
                        ? String((item as any)[col.key])
                        : '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination Bar */}
      {!disablePagination && !isTableLoading && totalItems > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-400">
          <div className="tabular-nums">
            Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startIdx.toLocaleString()}</span>–
            <span className="font-semibold text-slate-800 dark:text-slate-200">{endIdx.toLocaleString()}</span> of{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalItems.toLocaleString()}</span> records
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />
              Previous
            </button>
            <span className="px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
